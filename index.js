import bacon from 'baconjs';
import tail from 'lodash/tail';
import noop from 'lodash/noop';
import isEqual from 'lodash/isEqual';

let pauseUpdating = false;
let historyBus;

/**
 * baconRouter from intial baseUrl and initialPath, updating browser URL location and states automagically.
 *
 * Routes:
 * - PathMatching String or Regex,
 * - Called function (return stream),
 * - PathMatching String or Regex,
 * - Called function (return stream),
 *
 *  should look like
 * [
 *     '',
 *     () => bacon.later(0, {pageType: '404'}),
 *
 *     /(.+)\/supercoach/,
 *     (matchId) => bacon.later(0, {matchId, pageType: 'supercoach'}),
 * ]
 *
 * @param  {String}     baseUrl          Base Path (to be ignored from URL.location)
 * @param  {String}     initialPath      Starting Path (should match one of your routes)
 * @param  {...Mixed}   routesAndReturns (String|Regex, Function, n+) Route + Function to call on match
 * @return {Observable}                  EventStream that returns your matched route stream per route.
 */
export default function baconRouter(baseUrl, initialPath, ...routesAndReturns) {
    // @TODO BaseUrl, Initial Path, And RoutesAndReturns should be objects.
    // Required next is '404' or missed routes perhaps. Currently the returned stream
    // is just 'nothing', means we won't hit anything.

    let hasReplacedState = false;

    const historyBus = getBaconRouterHistoryBus();
    const history = bacon.update(
        {
            location: baseUrl + '/' + initialPath,
            state: null,
            title: null
        },

        [historyBus], ((previous, newHistory) => newHistory)
    ).doAction(({state, title, location}) => {
        if (pauseUpdating || !process || !process.browser) {
            return;
        }

        const thisHistory = { // For first render, history will have no values so take from the window
            state,
            title: title || window.document.title,
            location: location || window.location.href
        };

        window.document.title = thisHistory.title;

        if (hasReplacedState) {
            window.history.pushState(thisHistory, title, location);
        } else {
            window.history.replaceState(thisHistory, title);
            hasReplacedState = true;
        }
    }).skipDuplicates(isEqual);

    listenToPopState(historyBus);

    return history.flatMapLatest((history) => {
        let {location/*, state*/} = history;  // eslint-disable-line spaced-comment
        const currentRoute = location.replace(baseUrl, ''); // @TODO Less hacky.
        let route, routeReturns;
        let matches;

        // Because the routes and functions are 'paired', loop in increments of 2, first section is a route
        // where the second section is the function to call and return.
        for (let i = 0; i < routesAndReturns.length; i = i + 2) {
            route = routesAndReturns[i];
            routeReturns = routesAndReturns[i + 1];

            if (typeof routeReturns != 'function') {
                throw `baconRouter: Unexpected input ${typeof routeReturns} at argument ${i}.
                    Format is <base>, <initialPath>, <route-match>, <route-response-function>, <route-match>...`;
            }

            if (typeof route == 'string') {
                if (route === currentRoute) {
                    return routeReturns();
                }
            } else if (route instanceof RegExp) {
                matches = route.exec(currentRoute);

                if (matches) {
                    return routeReturns(...tail(matches)); // First item is the string that matched, not the capture groups.
                }
            } else {
                throw 'baconRouter: Unknown route test method';
            }
        }

        return bacon.never();
    });
}

/**
 * The bacon router history bus can be used to push locations into browser history
 *
 * @return {Observable} A bus which expects objects like {location, state, title}
 */
export function getBaconRouterHistoryBus() {
    if (process && process.browser) {
        if (!historyBus) {
            historyBus = new bacon.Bus();
        }

        return historyBus;
    } else {
        // Always recreate the history bus for node.
        return new bacon.Bus();
    }
}

export function listenToPopState(historyBus) {
    if (!process || !process.browser) {
        return;
    }

    let originalOnPopState = window.onpopstate || noop;
    let originalUnload = window.onbeforeunload || noop;

    window.onpopstate = ((event) => {
        const stateData = event.state || {};

        pauseUpdating = true;

        historyBus.push({
            state:    stateData.state,
            title:    stateData.title,
            location: stateData.location
        });

        setTimeout(() => {
            pauseUpdating = false;
        });

        originalOnPopState(event);
    });

    window.onbeforeunload = (() => {
        pauseUpdating = true;

        originalUnload(arguments);
    });
}

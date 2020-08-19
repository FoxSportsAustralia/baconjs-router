import bacon from 'baconjs';
import pathToRegexp from 'path-to-regexp';
import chunk from 'lodash/chunk';
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
 * @param  {...*}       routesAndReturns (String|Regex, Function, n+) Route + Function to call on match
 * @return {Observable}                  EventStream that returns your matched route stream per route.
 */
export default function baconRouter(baseUrl, initialPath, ...routesAndReturns) {
    // @TODO BaseUrl, Initial Path, And RoutesAndReturns should be objects.
    // Required next is '404' or missed routes perhaps. Currently the returned stream
    // is just 'nothing', means we won't hit anything.

    // Because the routes and functions are 'paired', loop in increments of 2, first section is a route
    // where the second section is the function to call and return.
    // Generate [[(currentRoute) => [matches, value]]
    const routesAndHandlers = chunk(routesAndReturns)
        .map(([route, handler], i) => {
            if (typeof handler !== 'function') {
                throw new Error(
                    `baconRouter: Unexpected input ${typeof handler} at argument ${(i * 2) + 1}. `
                    + 'Format is <base>, <initialPath>, <route-match>, <route-response-function>, <route-match>...'
                );
            }

            if (typeof route === 'string') {
                const keys = [];
                const regexp = pathToRegexp(route, keys);

                return (currentRoute, splitCurrentRoute) => {
                    const [encodedPath, search, hash] = splitCurrentRoute();

                    let path;

                    try {
                        path = decodeURIComponent(encodedPath);
                    } catch (error) {
                        // URL path isn't valid - caught and wrapped in bacon.Error (below)
                        throw {
                            type: 'baconjs-router.malformed-url',
                            data: {
                                url: location.href,
                            },
                            message: `Malformed URL: ${location}`,
                        };
                    }
                    const matches = regexp.exec(path);

                    if (matches) {
                        const params = keys.reduce((acc, {name}, index) => Object.assign(acc, {[name]: matches[index + 1]}), {});
                        const query = search
                            .split('&')
                            .reduce((acc, search) => {
                                if (!search) {
                                    return acc;
                                }

                                let key, value;

                                try {
                                    [key, value] = search
                                        .split('=', 2)
                                        .map(decodeURIComponent);
                                } catch (error) {
                                    // Ignore malformed query param
                                    return acc;
                                }

                                return key ? Object.assign(acc, {[key]: value}) : acc;
                            }, {});

                        return [true, handler({params, query, hash})];
                    } else {
                        return [false];
                    }
                };
            } else if (route instanceof RegExp) {
                return (currentRoute) => {
                    const matches = route.exec(currentRoute);

                    if (matches) {
                        return [true, handler(...matches.slice(1))]; // First item is the string that matched, not the capture groups.
                    } else {
                        return [false];
                    }
                };
            } else {
                throw new Error('baconRouter: Unknown route test method');
            }
        });

    let hasBaconRouterBooted = false;

    const historyBus = getBaconRouterHistoryBus();
    const history = bacon
        .update(
            {
                location: baseUrl + '/' + initialPath,
                state: null,
                title: null,
            },

            [historyBus], ((previous, newHistory) => newHistory)
        )
        .doAction(({state, title, location, shouldReplaceState}) => {
            if (pauseUpdating || !process || !process.browser) {
                return;
            }

            const thisHistory = { // For first render, history will have no values so take from the window
                state,
                title: title || window.document.title,
                location: location || window.location.href,
            };

            window.document.title = thisHistory.title;

            if (hasBaconRouterBooted && shouldReplaceState) {
                window.history.replaceState(thisHistory, title, location);
            } else if (hasBaconRouterBooted) {
                window.history.pushState(thisHistory, title, location);
            } else {
                window.history.replaceState(thisHistory, title);
                hasBaconRouterBooted = true;
            }
        })
        .skipDuplicates(isEqual);

    listenToPopState(historyBus);

    return history.flatMapLatest((history) => {
        let {location/*, state*/} = history;  // eslint-disable-line spaced-comment
        const currentRoute = location.replace(baseUrl, ''); // @TODO Less hacky.
        const splitCurrentRoute = () => (
            (/^([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/.exec(currentRoute) || [])
                .slice(1)
                .map((value) => value || '')
        );

        for (let i = 0; i < routesAndHandlers.length; ++i) {
            try {
                const [isMatched, value] = routesAndHandlers[i](currentRoute, splitCurrentRoute);

                if (isMatched) {
                    return value;
                }
            } catch (error) {
                return new bacon.Error(error);
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
        // If a navigation attempt occurs other than via historyBus, reload the page at the new location.
        if (!event.state) {
            event.target.location.reload();

            return;
        }

        const stateData = event.state;

        pauseUpdating = true;

        historyBus.push({
            state:    stateData.state,
            title:    stateData.title,
            location: stateData.location,
        });
        window.document.title = stateData.title || window.document.title;

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

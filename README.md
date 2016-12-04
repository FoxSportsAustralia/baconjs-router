## Bacon.js Router

`baconjs-router` is a project used at Fox Sports Australia for a few of our projects in an effort to have simple SinglePageApps, using our favourite Bacon.js reactive stream based logic.

## Code Example

```
import baconjsRouter, {getBaconRouterHistoryBus} from 'baconjs-router';

// For demo purposes, we're going to simply say our baseUrl and current path is based on where you'd view this example using `#` to denote new paths.

const routeStream = baconRouter(
    window.location.origin + window.location.pathname + '#',
    window.location.hash.replace('#', ''),

    // User ID Match
    /user\/(\d+)/,
    (idMatchedFromUrl) => bacon.later(0, {pageType: 'user', userId: idMatchedFromUrl})

    // /about route, matched purely by string
    'about', () => bacon.later(0, {pageType: 'about'})

    // All other routes are considered 404
    /./,
    () => bacon.later(0, {pageType: 404});
);
```

Keep in mind that like a Bacon.update or Bacon.when statement, the higher the route, the higher the action priority.  Therefore if you want to match `/user/1234/edit`, it should be in your routes before `/user/1234`, depending how you've written your matches.

## Sample

```
npm run example
```

and navigate yourself to the 'example.html' file.  Click a couple of links, then hit back.

## Motivation

We wanted something very basic in functionality that supported both browser logic, as well as server-side rendering logic.  The rest of the magic is up to you.

Because of the way we server-side render, we also needed to be able to dynamically set base paths where the server has no context of the page it's being called on.

Thus we have a concept of `baseUrl` and `path`, where `baseUrl` would be something like `http://www.foxsports.com.au/some-dynamic-page` and `path` would be handed in as something like 'root' `/` or maybe the `/football` section.  But as far as our router is concerned, we're only dealing with pages that happen on or beyond `http://www.foxsports.com.au/some-dynamic-page`

## Installation

```
npm install --save baconjs-router
```

Then just either import the router, or the controlling bus, or both (depending what you need).

```
import baconjsRouter, {getBaconRouterHistoryBus} from 'baconjs-router';
```

## API Reference

Depending on the size of the project, if it is small and simple enough the reference docs can be added to the README. For medium size to larger projects it is important to at least provide a link to where the API reference docs live.

## Tests

TBC - We have some internal tests, that aren't specifically around the router alone. We'll get to those.

## Contributors

All the Web Development Team here at Fox Sports Australia.

## License

MIT License, see LICENCE.md for details.

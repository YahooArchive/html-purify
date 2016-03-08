HTML5 Purify
====================

HTML5 Purifier - a fast and small footprint HTML5 purifier. The module uses a whitelist based approach to filter malicious characters,tags, attributes and attribute values while keeping the resulting output HTML5 compliant. It uses <a href="https://github.com/yahoo/context-parser">context parser</a> for parsing the input string, <a href="https://github.com/yahoo/xss-filters">xss filters</a> for filtering URI attribute values and <a href="https://github.com/yahoo/css-js">css-js</a> for filtering CSS data within the HTML input.

[![npm version][npm-badge]][npm]
[![dependency status][dep-badge]][dep-status]
[![Build Status](https://travis-ci.org/yahoo/html-purify.svg?branch=master)](https://travis-ci.org/yahoo/html-purify)

[npm]: https://www.npmjs.org/package/html-purify
[npm-badge]: https://img.shields.io/npm/v/html-purify.svg?style=flat-square
[dep-status]: https://david-dm.org/yahoo/html-purify
[dep-badge]: https://img.shields.io/david/yahoo/html-purify.svg?style=flat-square


## Quick Start 

Install html-purify from the npm repo
```shell
npm install html-purify
```

Server side use(nodejs)

```js
/* create the html purifier */
var Purifier = require('html-purify');
var purifier = new Purifier();

var input = '...'; 
/* filter the input string */
var result = purifier.purify(input);
```

## Advanced Usage

The following outlines the configuration that is secure by default. You should perform due dilligence to confirm your use cases are safe before disabling or altering the configurations.

```js
// The default configuration
new Purifier({
	whitelistTags: ['a', '...'],
	whitelistAttributes: ['href', '...'],
	enableCanonicalization: true,
	tagBalance: {
		enabled: true,
		stackSize: 100
	}
});
```

<!--
#### whitelistTags

#### whitelistAttributes

#### enableCanonicalization
-->

#### tagBalance
The untrusted data must be self-contained. Hence, it cannot close any tags prior to its inclusion, nor leave any of its own tags unclosed. An efficient and simple tag balancing algorithm is applied by default to enforce this goal only, and may not produce perfectly nested output. You may implement another tag balancing algorithm before invoking purify. But the default one should still be enabled, unless you're sure the self-contained requirement is met.

The ``stackSize`` (default: 100) is a limit imposed on the maximum number of unclosed tags (or the max levels of nested tags). When an untrusted data attempts to open tags that are so nested and has exceeded the allowed limit, the algorithm will cease any further processing but simply close all of those tags.

## Development

### How to build
```shell
npm install
npm run-script build
```

### How to test
```shell
npm test
```

## License

This software is free to use under the Yahoo Inc. BSD license.
See the [LICENSE file][] for license text and copyright information.

[LICENSE file]: ./LICENSE

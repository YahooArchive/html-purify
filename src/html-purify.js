/*
Copyright 2015, Yahoo Inc. 
Copyrights licensed under the New BSD License.
See the accompanying LICENSE file for terms.
*/
(function () {
    "use strict";

    var Parser = require('context-parser').Parser,
        whitelist = require("./tag-attr-list"),
        derivedState = require('./derived-states.js'),
        xssFilters = require('xss-filters'),
        CssParser = require('css-js');

    function Purifier() {
        this.parser = new Parser({
            enableInputPreProcessing: true,
            enableCanonicalization: true,
            enableVoidingIEConditionalComments: true
        });
        this.output = '';
        this.attrVals = {};
        this.hasSelfClosing = 0;
        this.cssParser = new CssParser({"ver": "strict", "throwError": false});
    }

    // TODO: introduce polyfill for Array.indexOf
    function contains(arr, element) {
        for (var i = 0, len = arr.length; i < len; i++) {
            if (arr[i] === element) {
                return true;
            }
        }
        return false;
    }

    function processTransition(prevState, nextState, i) {
        /* jshint validthis: true */
        /* jshint expr: true */
        var parser = this.parser,
            idx, tagName, attrValString;

        switch (derivedState.Transitions[prevState][nextState]) {
            
        case derivedState.TransitionName.WITHIN_DATA:
            this.output += parser.input[i];
        break;

        case derivedState.TransitionName.FROM_TAG_ATTR_TO_DATA:
            idx = parser.getCurrentTagIndex();
            tagName = parser.getCurrentTag(idx);

            if (contains(whitelist.Tags, tagName)) {

                if (prevState === 35 ||
                    prevState === 36 || 
                    prevState === 40) {
                    this.attrVals[parser.getAttributeName()] = parser.getAttributeValue();
                }

                attrValString = '';
                for (var key in this.attrVals) {
                    if (contains(whitelist.Attributes, key)) {
                        attrValString += " " + key;
                        if (this.attrVals[key].length > 0) {
                            attrValString += "=" + "\"" + this.attrVals[key] + "\"";
                        }
                    }
                    else if (contains(whitelist.HrefAttributes, key)) {
                        attrValString += " " + key;
                        if (this.attrVals[key].length > 0) {
                            attrValString += "=" + "\"" + xssFilters.uriInDoubleQuotedAttr(decodeURI(this.attrVals[key])) + "\"";   
                        }
                    }
                    else if (key === "style") {// TODO: move style to a const
                        if (this.cssParser.parseCssString(this.attrVals[key])) {
                             attrValString += " " + key + "=" + "\"" + this.attrVals[key] + "\"";
                        }
                    }
                }

                // handle self-closing tags and strip attributes in the end tag if any
                this.output += idx ? 
                    "</" + tagName + ">" :
                    "<" + tagName + attrValString + (this.hasSelfClosing ? ' />' : '>');
            }

            // reinitialize once tag has been written to output
            this.attrVals = {};
            this.hasSelfClosing = 0;
            break;

        case derivedState.TransitionName.ATTR_TO_AFTER_ATTR:
            this.attrVals[parser.getAttributeName()] = '';
            break;

        case derivedState.TransitionName.ATTR_VAL_TO_AFTER_ATTR_VAL:
            this.attrVals[parser.getAttributeName()] = parser.getAttributeValue();
            break;

        case derivedState.TransitionName.TAG_OPEN_TO_MARKUP_OPEN:
            this.output += "<" + parser.input[i];
            break;

        case derivedState.TransitionName.TO_SELF_CLOSING_START:
            this.hasSelfClosing = 1;
            break;
        }
    }

    Purifier.prototype.purify = function (data) {
        this.output = '';
        this.attrVals = {};
        this.hasSelfClosing = 0;
        var that = this;

        this.parser.on('postWalk', function (lastState, state, i, endsWithEOF) {
            processTransition.call(that, lastState, state, i);
        }).contextualize(data);
        return this.output;
    };

    module.exports = Purifier;
})();

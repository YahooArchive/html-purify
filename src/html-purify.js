/*
Copyright 2015, Yahoo Inc. 
Copyrights licensed under the New BSD License.
See the accompanying LICENSE file for terms.
*/


var Parser = require('context-parser').Parser;
var whitelist = require("./tag-attr-list");
var derivedState = require('./derived-states.js');
var xssFilters = require('xss-filters');
var CssParser = require('css-js');



(function () {
    "use strict";

    function Purifier() {
        var config = {
            enableInputPreProcessing: true,
            enableCanonicalization: true,
            enableVoidingIEConditionalComments: true
        };
        this.parser = new Parser(config);
        this.output = '';
        this.attrVals = {};
        this.hasSelfClosing = 0;
        this.cssParser = new CssParser({"ver": "strict", "throwError": false});
    }

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
            ch = parser.input[i],
            attributeName = parser.getAttributeName(),
            attributeValue = parser.getAttributeValue(),
            // TODO: use idx = getTagIndex() and parser.getCurrentTag(idx)
            // once those functions are available in context parser 
            idx = parser.tagIdx,
            tagName = parser.tags[idx].toLowerCase(),
            attrValString = '';

        switch (derivedState.Transitions[prevState][nextState]) {
        case 1:
	    this.output += ch;
	    break;
        case 2:
            if (prevState === 35) {
                this.attrVals[attributeName] = attributeValue;
            }
            if (prevState === 36) {
                this.attrVals[attributeName] = attributeValue;
            }
            if (prevState === 40) {
                this.attrVals[attributeName] = attributeValue;
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
            if (contains(whitelist.Tags, tagName)) {
                attrValString += (this.hasSelfClosing && !idx) ? " /" : '';
                attrValString = idx ? "" : attrValString;
                this.output += "<" + (idx ? "/" : "") + tagName + attrValString + ">";
            }

            // reinitialize once tag has been written to output
            this.attrVals = {};
            this.hasSelfClosing = 0;
            break;

        case 3:
            this.attrVals[attributeName] = '';
            break;

        case 4:
            this.attrVals[attributeName] = attributeValue;
            break;

        case 5:
            this.output += "<";
            this.output += ch;
            break;

        case 6:
            this.hasSelfClosing = 1;
            break;

        default:
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

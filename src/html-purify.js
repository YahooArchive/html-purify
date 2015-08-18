/*
Copyright 2015, Yahoo Inc. 
Copyrights licensed under the New BSD License.
See the accompanying LICENSE file for terms.
*/
(function () {
    "use strict";

    var Parser = require('context-parser').Parser,
        tagAttList = require("./tag-attr-list"),
        derivedState = require('./derived-states.js'),
        xssFilters = require('xss-filters'),
        CssParser = require('css-js'),
        hrefAttributes = tagAttList.HrefAttributes,
        voidElements = tagAttList.VoidElements,
        optionalElements = tagAttList.OptionalElements;

    /*jshint -W030 */
    function Purifier(config) {
        var that = this, tagBalance;

        config = config || {};
        // defaulted to true
        config.enableCanonicalization = config.enableCanonicalization !== false;
        config.enableVoidingIEConditionalComments = config.enableVoidingIEConditionalComments !== false;
    
        // defaulted to true
        config.tagBalance || (config.tagBalance = {});
        tagBalance = that.tagBalance = {};
        tagBalance.stackOverflow = false;
        if ((tagBalance.enabled = config.tagBalance.enabled !== false)) {
            tagBalance.stackSize = parseInt(config.tagBalance.stackSize) || 100;
            tagBalance.stackPtr = 0;
            tagBalance.stack = new Array(tagBalance.stackSize);
        }

        // accept array of tags to be whitelisted, default list in tag-attr-list.js
        that.tagsWhitelist = config.whitelistTags || tagAttList.WhiteListTags;
        // accept array of attributes to be whitelisted, default list in tag-attr-list.js
        that.attributesWhitelist = config.whitelistAttributes || tagAttList.WhiteListAttributes;
        
        that.config = config;

        that.parser = new Parser({
            enableInputPreProcessing: true,
            enableStateTracking: false,
            enableCanonicalization: config.enableCanonicalization,
            enableVoidingIEConditionalComments: false // comments are always stripped from the output anyway
        }).on('postWalk', function (lastState, state, i, endsWithEOF) {
            !tagBalance.stackOverflow && processTransition.call(that, lastState, state, i);
        });

        that.cssParser = new CssParser({"ver": "strict", "throwError": false});
        
    }

    // TODO: introduce polyfill for Array.lastIndexOf
    function arrayLastIndexOf(arr, element, fromIndex) {
        for (var i = fromIndex === undefined ? arr.length - 1 : fromIndex; i >= 0; i--) {
            if (arr[i] === element) {
                return i;
            }
        }
        return -1;
    }

    function processTransition(prevState, nextState, i) {
        /* jshint validthis: true */
        /* jshint expr: true */
        var parser = this.parser,
            tagBalance = this.tagBalance,
            idx = 0, tagName = '', attrValString = '', key = '', value = '', hasSelfClosing = 0;
        
        switch (derivedState.Transitions[prevState][nextState]) {
            
        case derivedState.TransitionName.WITHIN_DATA:
            this.output += parser.input[i];
        break;

        case derivedState.TransitionName.FROM_TAG_ATTR_TO_DATA:
            idx = parser.getCurrentTagIndex();
            tagName = parser.getCurrentTag(idx);

            if (arrayLastIndexOf(this.tagsWhitelist, tagName) !== -1) {

                if (idx) {
                    if (tagBalance.enabled && !optionalElements[tagName]) {
                        // relaxed tag balancing, accept it as long as the tag exists in the stack
                        idx = arrayLastIndexOf(tagBalance.stack, tagName, tagBalance.stackPtr - 1);

                        if (idx >= 0) {
                            this.output += '</' + tagName + '>';
                            tagBalance.stack.splice(idx, 1);
                            tagBalance.stackPtr--;
                        }

                        // // add closing tags for any opened ones before closing the current one
                        // while((openedTag = this.openedTags.pop()) && openedTag !== tagName) {
                        //     this.output += '</' + openedTag + '>';
                        // }
                        // // openedTag is undefined if tagName is never found in all openedTags, no output needed
                        // if (openedTag) {
                        //     this.output += '</' + openedTag + '>';
                        // }
                    }
                    else {
                        this.output += '</' + tagName + '>';
                    }
                }
                else {
                    // void elements only have a start tag; end tags must not be specified for void elements.
                    // this.hasSelfClosing = this.hasSelfClosing || voidElements[tagName];
                    hasSelfClosing = voidElements[tagName];

                    // push the tagName into the openedTags stack if not found:
                    //  - a self-closing tag or a void element
                    // this.config.tagBalance.enabled && !this.hasSelfClosing && this.openedTags.push(tagName);
                    if (tagBalance.enabled && !hasSelfClosing && !optionalElements[tagName]) {
                        if (tagBalance.stackPtr < tagBalance.stackSize) {
                            tagBalance.stack[tagBalance.stackPtr++] = tagName;
                        } else {
                            // cease processing anything if it exceeds the maximum stack size allowed
                            tagBalance.stackOverflow = true;
                            break;
                        }
                    }

                    if (prevState === 35 ||
                        prevState === 36 ||
                        prevState === 40) {
                        this.attrVals[parser.getAttributeName()] = parser.getAttributeValue();
                    }

                    for (key in this.attrVals) {
                        if (arrayLastIndexOf(this.attributesWhitelist, key) !== -1) {
                            value = this.attrVals[key];

                            if (key === "style") { // TODO: move style to a const
                                if (value === null) {
                                    attrValString += ' ' + key + '=""';
                                }
                                else if (this.cssParser.parseCssString(value)) {
                                    attrValString += ' ' + key + '="' + value + '"';
                                }
                                continue;
                            }

                            attrValString += ' ' + key;
                            if (value !== null) {
                                attrValString += '="' + (hrefAttributes[key] ? xssFilters.uriInDoubleQuotedAttr(decodeURI(value)) : value) + '"';
                            }
                        }
                    }

                    // handle self-closing tags
                    this.output += '<' + tagName + attrValString + (hasSelfClosing ? ' />' : '>');
                    // this.output += '<' + tagName + attrValString + '>';

                }
            }
            // reinitialize once tag has been written to output
            this.attrVals = {};
            break;

        case derivedState.TransitionName.ATTR_TO_AFTER_ATTR:
            this.attrVals[parser.getAttributeName()] = null;
            break;

        case derivedState.TransitionName.ATTR_VAL_TO_AFTER_ATTR_VAL:
            this.attrVals[parser.getAttributeName()] = parser.getAttributeValue() || '';
            break;

        //case derivedState.TransitionName.TAG_OPEN_TO_MARKUP_OPEN:
        //    this.output += "<" + parser.input[i];
	    //    break;

        case derivedState.TransitionName.TO_SELF_CLOSING_START:
            // boolean attributes may not have a value
            if (prevState === 35) {
                this.attrVals[parser.getAttributeName()] = null;
            }

            /* According to https://html.spec.whatwg.org/multipage/syntax.html#start-tags
             * "Then, if the element is one of the void elements, or if the element is a foreign element, then there may be a single U+002F SOLIDUS character (/). 
             * This character has no effect on void elements, but on foreign elements it marks the start tag as self-closing."
             */ 
            // that means only foreign elements can self-close (self-closing is optional for void elements)
            // no foreign elements will be allowed, so the following logic can be commented
            // openedTag = parser.getStartTagName();
            // if (openedTag === 'svg' || openedTag === 'math') { // ...
            //     this.hasSelfClosing = true;
            // }
            
            break;
        }
    }

    Purifier.prototype.purify = function (data) {
        var that = this, i;

        that.attrVals = {};
        that.output = '';

        if (that.tagBalance.enabled) {
            that.tagBalance.stack = new Array(this.tagBalance.stackSize);
            that.tagBalance.stackPtr = 0;
        }

        that.parser.reset().contextualize(data);

        if (that.tagBalance.enabled) {

            // close any remaining openedTags
            for (i = that.tagBalance.stackPtr - 1; i >= 0; i--) {
                that.output += '</' + that.tagBalance.stack[i] + '>';
            }
            // if ((that.tagBalance.stack.length = that.tagBalance.stackPtr)) {
            //     that.output += '</' + that.tagBalance.stack.join('></') + '>';
            // }
            // while((openedTag = this.openedTags.pop())) {
            //     that.output += '</' + openedTag + '>';
            // }
        }

        return that.output;
    };

    module.exports = Purifier;
})();

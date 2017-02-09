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
        attrFilter = {
            38: xssFilters.uriInDoubleQuotedAttr,
            39: xssFilters.uriInSingleQuotedAttr,
            40: xssFilters.uriInUnQuotedAttr
        },
        quote = {38: '"', 39: '\'', 40: ''};

    function Purifier(config) {
        var that = this;

        config = config || {};
        // defaulted to true
        config.enableCanonicalization = config.enableCanonicalization !== false;
        config.enableTagBalancing = config.enableTagBalancing !== false;

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
            processTransition.call(that, lastState, state, i);
        });

        that.cssParser = new CssParser({"ver": "strict", "throwError": false});
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
            idx, tagName, attrValString, openedTag, key, value,
            quoteState, quoteChar, attrValObj;

        
        switch (derivedState.Transitions[prevState][nextState]) {
            
        case derivedState.TransitionName.WITHIN_DATA:
            this.output += parser.input[i];
        break;

        case derivedState.TransitionName.FROM_TAG_ATTR_TO_DATA:
            idx = parser.getCurrentTagIndex();
            tagName = parser.getCurrentTag(idx);

            if (contains(this.tagsWhitelist, tagName)) {

                if (idx) {
                    if (this.config.enableTagBalancing) {
                        // add closing tags for any opened ones before closing the current one
                        while((openedTag = this.openedTags.pop()) && openedTag !== tagName) {
                            this.output += '</' + openedTag + '>';
                        }
                        // openedTag is undefined if tagName is never found in all openedTags, no output needed
                        if (openedTag) {
                            this.output += '</' + openedTag + '>';
                        }
                    }
                    else {
                        this.output += '</' + tagName + '>';
                    }
                }
                else {
                    //  - void elements only have a start tag; end tags must not be specified for void elements.
                    this.hasSelfClosing = this.hasSelfClosing || voidElements[tagName];

                    // push the tagName into the openedTags stack if not found:
                    //  - a self-closing tag or a void element
                    this.config.enableTagBalancing && !this.hasSelfClosing && this.openedTags.push(tagName);

                    if (prevState === 35 ||
                        prevState === 36 ||
                        prevState === 40) {
                        this.attrVals.push({
                            'name': parser.getAttributeName(),
                            'value': parser.getAttributeValue(),
                            'quoteState': prevState
                        });
                    }

                    attrValString = '';
                    for (var j = 0, len = this.attrVals.length ; j < len; j++) {
                        key = this.attrVals[j].name;
                        if (contains(this.attributesWhitelist, key)) {
                            value = this.attrVals[j].value;

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
                                quoteState = this.attrVals[j].quoteState;
                                quoteChar = quote[quoteState];
                                attrValString += '=' + quoteChar + (hrefAttributes[key] ? attrFilter[quoteState](decodeURI(value)) : value) + quoteChar;
                            }
                        }
                    }

                    // handle self-closing tags
                    this.output += '<' + tagName + attrValString + (this.hasSelfClosing ? ' />' : '>');

                }
            }
            // reinitialize once tag has been written to output
            this.attrVals = [];
            this.hasSelfClosing = 0;
            break;

        case derivedState.TransitionName.ATTR_TO_AFTER_ATTR:
            //this.attrVals[parser.getAttributeName()]['value'] = null;
            this.attrVals.push({
                'name': parser.getAttributeName(),
                'value': null
            });
            break;

        case derivedState.TransitionName.ATTR_VAL_TO_AFTER_ATTR_VAL:
            // remove the element
            attrValObj = {
                'name': parser.getAttributeName(),
                'value': parser.getAttributeValue() || '',
                'quoteState': prevState
            };

            idx = this.attrVals.length - 1;
            
            // if the attribute was added to attrVals in case ATTR_TO_AFTER_ATTR,
            // then rewrite its value
            if (this.attrVals.length > 0 && this.attrVals[idx].name === parser.getAttributeName() ){
                this.attrVals[idx] = attrValObj;

            } else {
                this.attrVals.push(attrValObj);
            }
            break;

        //case derivedState.TransitionName.TAG_OPEN_TO_MARKUP_OPEN:
        //    this.output += "<" + parser.input[i];
	    //    break;

        case derivedState.TransitionName.TO_SELF_CLOSING_START:
            // boolean attributes may not have a value
            if (prevState === 35) {
                this.attrVals.push({
                    'name': parser.getAttributeName(),
                    'value': null
                });
            }
            this.hasSelfClosing = 1;
            break;
        }
    }

    Purifier.prototype.purify = function (data) {
        var that = this, openedTag;

        that.output = '';
        that.openedTags = [];
        that.attrVals = [];
        that.hasSelfClosing = 0;
        that.parser.reset();
        that.parser.contextualize(data);

        if (that.config.enableTagBalancing) {
            // close any remaining openedTags
            while((openedTag = this.openedTags.pop())) {
                that.output += '</' + openedTag + '>';
            }
        }

        return that.output;
    };

    module.exports = Purifier;
})();

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
        yubl = require('xss-filters')._privFilters.yubl,
        uriBlacklistFilter = function(s){ return yubl(s.replace(/\x00/g, '%00')); },
        CssParser = require('css-js'),
        hrefAttribtues = tagAttList.HrefAttributes,
        voidElements = tagAttList.VoidElements;

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

    function addQuoteToValue(attrAction, value) {
        if (attrAction === derivedState.TransitionName.DQ_ATTR) {         // collect double quoted value
            return '"' + value + '"';
        } 
        else if (attrAction === derivedState.TransitionName.SQ_ATTR) {    // collect single quoted value
            return "'" + value + "'";
        } 
        else /*if (attrAction === derivedState.TransitionName.UQ_ATTR) {  // collect unquoted value */{
            return value;
        }
    }

    function processTransition(prevState, nextState, i) {
        /* jshint validthis: true */
        /* jshint expr: true */
        var parser = this.parser,
            action = derivedState.Transitions[prevState][nextState],
            attrAction = action & 0x7,
            idx, tagName, attrValString, openedTag, key, value;

        // check if tag and/or attr is available for collection
        // collect the values (if any) only when the attr name is allowed
        if (attrAction && contains(this.attributesWhitelist, (key = parser.getAttributeName()))) {

            // collect the attr name only
            // boolean attributes may not have a value
            if (attrAction === derivedState.TransitionName.NV_ATTR) {
                this.attrVals[key] = null;
            }
            // collect both the attr name and value
            else {
                value = parser.getAttributeValue() || '';

                // store only valid style attribute value
                if (key === 'style') {
                    if (this.cssParser.parseCssString(value)) {
                        this.attrVals[key] = addQuoteToValue(attrAction, value);
                    }
                } 
                // apply the blacklist filter for URI attr value
                else if (hrefAttribtues[key]) {
                    this.attrVals[key] = addQuoteToValue(attrAction, uriBlacklistFilter(value));
                }
                else {
                    this.attrVals[key] = addQuoteToValue(attrAction, value);
                }
            }
        }

        // mask out the last 3 bits that represent attr value action
        switch (action & 0xF8) {
            
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
                    this.hasSelfClosing = /*this.hasSelfClosing ||*/ voidElements[tagName];

                    // push the tagName into the openedTags stack if not found:
                    //  - a self-closing tag or a void element
                    this.config.enableTagBalancing && !this.hasSelfClosing && this.openedTags.push(tagName);

                    // output all allowed attr names and values
                    attrValString = '';
                    for (key in this.attrVals) {
                        value = this.attrVals[key];
                        attrValString += (value === null) ? ' ' + key : ' ' + key + '=' + value;
                    }

                    // handle self-closing tags
                    this.output += '<' + tagName + attrValString + (this.hasSelfClosing ? ' />' : '>');
                }
            }
            // reinitialize once tag has been written to output
            this.attrVals = {};
            // this.hasSelfClosing = false;
            break;

        // case derivedState.TransitionName.TO_SELF_CLOSING_START:
        //     this.hasSelfClosing = true;
        //     break;
        }
    }

    Purifier.prototype.purify = function (data) {
        var that = this, openedTag;

        that.output = '';
        that.openedTags = [];
        that.attrVals = {};
        // that.hasSelfClosing = false;
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

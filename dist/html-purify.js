(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Purifier = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
Copyright (c) 2015, Yahoo! Inc. All rights reserved.
Copyrights licensed under the New BSD License.
See the accompanying LICENSE file for terms.

Authors: Nera Liu <neraliu@yahoo-inc.com>
         Albert Yu <albertyu@yahoo-inc.com>
         Adonis Fung <adon@yahoo-inc.com>
*/
/*jshint -W030 */
(function() {
"use strict";

var stateMachine = require('./html5-state-machine.js'),
    htmlState = stateMachine.State,
    reInputPreProcessing = /(?:\r\n?|[\x01-\x08\x0B\x0E-\x1F\x7F-\x9F\uFDD0-\uFDEF\uFFFE\uFFFF]|[\uD83F\uD87F\uD8BF\uD8FF\uD93F\uD97F\uD9BF\uD9FF\uDA3F\uDA3F\uDA7F\uDABF\uDAFF\uDB3F\uDB7F\uDBBF\uDBFF][\uDFFE\uDFFF])/g;

/**
 * @class FastParser
 * @constructor FastParser
 */
function FastParser(config) {
    var self = this, k;

    // deep copy config to this.config
    self.config = {};
    if (config) {
        for (k in config) {
            self.config[k] = config[k];
        }
    }
    config = self.config;   

    // config enabled by default - no conversion needed
    // config.enableInputPreProcessing = (config.enableInputPreProcessing !== false);

    self.listeners = {};
    self.reset();
}

/**
 * @function FastParser#reset
 *
 * @description
 * Reset all internal states, as if being created with the new operator
 */
 FastParser.prototype.reset = function () {
    var self = this;

    self.state = stateMachine.State.STATE_DATA;  /* Save the current status */
    self.tags = ['', '']; /* Save the current tag name */
    self.tagIdx = 0;
    self.attrName = ''; /* Save the current attribute name */
    self.attributeValue = null; /* Save the current attribute value */
    self.input = '';
    self.inputLen = 0;

    return self;
 };

/**
 * @function FastParser#on
 *
 * @param {string} eventType - the event type 
 * @param {function} listener - the event listener
 * @returns this
 *
 * @description
 * <p>register the given event listener to the given eventType</p>
 *
 */
FastParser.prototype.on = function (eventType, listener) {
    var l = this.listeners[eventType];
    if (listener) {
        if (l) {
            l.push(listener);
        } else {
            this.listeners[eventType] = [listener];
        }
    }
    return this;
};

/**
 * @function FastParser#once
 *
 * @param {string} eventType - the event type (e.g., preWalk, reWalk, postWalk, ...)
 * @param {function} listener - the event listener
 * @returns this
 *
 * @description
 * <p>register the given event listener to the given eventType, for which it will be fired only once</p>
 *
 */
FastParser.prototype.once = function(eventType, listener) {
    var self = this, onceListener;
    if (listener) {
        onceListener = function () {
            self.off(eventType, onceListener);
            listener.apply(self, arguments);
        };
        return this.on(eventType, onceListener);
    }
    return this;
};

/**
 * @function FastParser#off
 *
 * @param {string} eventType - the event type (e.g., preWalk, reWalk, postWalk, ...)
 * @param {function} listener - the event listener
 * @returns this
 *
 * @description
 * <p>remove the listener from being fired when the eventType happen</p>
 *
 */
FastParser.prototype.off = function (eventType, listener) {
    if (listener) {
        var i, len, listeners = this.listeners[eventType];
        if (listeners) {
            for (i = 0; listeners[i]; i++) {
                if (listeners[i] === listener) {
                    listeners.splice(i, 1);
                    break;
                }
            }
        }
    }
    return this;
};

/**
 * @function FastParser#emit
 *
 * @param {string} eventType - the event type (e.g., preWalk, reWalk, postWalk, ...)
 * @returns this
 *
 * @description
 * <p>fire those listeners correspoding to the given eventType</p>
 *
 */
FastParser.prototype.emit = function (listeners, args) {
    if (listeners) {
        var i = -1, len;
        if ((len = listeners.length)) {
            while (++i < len) {
                listeners[i].apply(this, args || []);
            }
        }
    }
    return this;
};

/*
 * @function FastParser#walk
 *
 * @param {integer} i - the position of the current character in the input stream
 * @param {string} input - the input stream
 * @returns {integer} the new location of the current character.
 *
 */
FastParser.prototype.walk = function(i, input, endsWithEOF) {

    var ch = input[i],
        symbol = this.lookupChar(ch),
        extraLogic = stateMachine.lookupAltLogicFromSymbol[symbol][this.state],
        reconsume = stateMachine.lookupReconsumeFromSymbol[symbol][this.state];

    /* Set state based on the current head pointer symbol */
    this.state = stateMachine.lookupStateFromSymbol[symbol][this.state];

    /* See if there is any extra logic required for this state transition */
    switch (extraLogic) {
        case 1:  this.createStartTag(ch); break;
        case 2:  this.createEndTag(ch);   break;
        case 3:  this.appendTagName(ch);  break;
        case 4:  this.resetEndTag(ch);    break;
        case 6:                       /* match end tag token with start tag token's tag name */
            if(this.tags[0].toLowerCase() === this.tags[1].toLowerCase()) {
                reconsume = 0;  /* see 12.2.4.13 - switch state for the following case, otherwise, reconsume. */
                this.matchEndTagWithStartTag(symbol);
            }
            break;
        case 8:  this.matchEscapedScriptTag(ch); break;
        case 11: this.processTagName(ch); break;
        case 12: this.createAttributeNameAndValueTag(ch); break;
        case 13: this.appendAttributeNameTag(ch); break;
        case 14: this.appendAttributeValueTag(ch); break;
    }

    if (reconsume) {                  /* reconsume the character */
        this.listeners.reWalk && this.emit(this.listeners.reWalk, [this.state, i, endsWithEOF]);
        return this.walk(i, input);
    }

    return i;
};

FastParser.prototype.createStartTag = function (ch) {
    this.tagIdx = 0;
    this.tags[0] = ch;
};

FastParser.prototype.createEndTag = function (ch) {
    this.tagIdx = 1;
    this.tags[1] = ch;
};

FastParser.prototype.appendTagName = function (ch) {
    this.tags[this.tagIdx] += ch;
};

FastParser.prototype.resetEndTag = function (ch) {
    this.tagIdx = 1;
    this.tags[1] = '';
};

FastParser.prototype.matchEndTagWithStartTag = function (symbol) {
        /* Extra Logic #6 :
        WHITESPACE: If the current end tag token is an appropriate end tag token, then switch to the before attribute name state.
                Otherwise, treat it as per the 'anything else' entry below.
        SOLIDUS (/): If the current end tag token is an appropriate end tag token, then switch to the this.closing start tag state.
                Otherwise, treat it as per the 'anything else' entry below.
        GREATER-THAN SIGN (>): If the current end tag token is an appropriate end tag token, then switch to the data state and emit the current tag token.
                Otherwise, treat it as per the 'anything else' entry below.
        */
        this.tags[0] = '';
        this.tags[1] = '';

        switch (symbol) {
            case stateMachine.Symbol.SPACE: /** Whitespaces */
                this.state = stateMachine.State.STATE_BEFORE_ATTRIBUTE_NAME;
                return ;
            case stateMachine.Symbol.SOLIDUS: /** [/] */
                this.state = stateMachine.State.STATE_SELF_CLOSING_START_TAG;
                return ;
            case stateMachine.Symbol.GREATER: /** [>] */
                this.state = stateMachine.State.STATE_DATA;
                return ; 
        }
};

FastParser.prototype.matchEscapedScriptTag = function (ch) {
    /* switch to the script data double escaped state if we see <script> inside <script><!-- */    
    if ( this.tags[1].toLowerCase() === 'script') {
        this.state = stateMachine.State.STATE_SCRIPT_DATA_DOUBLE_ESCAPED;
    }
};

FastParser.prototype.processTagName = function (ch) {
    /* context transition when seeing <sometag> and switch to Script / Rawtext / RCdata / ... */
    switch (this.tags[0].toLowerCase()) {
        // TODO - give exceptions when non-HTML namespace is used.
        // case 'math':
        // case 'svg':
        //     break;
        case 'script':
            this.state = stateMachine.State.STATE_SCRIPT_DATA;
            break;
        case 'noframes':
        case 'style':
        case 'xmp':
        case 'iframe':
        case 'noembed':
        case 'noscript':
            this.state = stateMachine.State.STATE_RAWTEXT;
            break;
        case 'textarea':
        case 'title':
            this.state = stateMachine.State.STATE_RCDATA;
            break;
        case 'plaintext':
            this.state = stateMachine.State.STATE_PLAINTEXT;
            break;
    }
};

FastParser.prototype.createAttributeNameAndValueTag = function (ch) {
    /* new attribute name and value token */
    this.attributeValue = null;
    this.attrName = ch;
};

FastParser.prototype.appendAttributeNameTag = function (ch) {
    /* append to attribute name token */
    this.attrName += ch;
};

FastParser.prototype.appendAttributeValueTag = function(ch) {
    this.attributeValue = this.attributeValue === null ? ch : this.attributeValue + ch;
};

/**
 * @function FastParser#lookupChar
 *
 * @param {char} ch - The character.
 * @returns {integer} The integer to represent the type of input character.
 *
 * @description
 * <p>Map the character to character type.
 * e.g. [A-z] = type 17 (Letter [A-z])</p>
 *
 */
FastParser.prototype.lookupChar = function(ch) {
    var o = ch.charCodeAt(0);
    if ( o > 122 ) { return 12; }
    return stateMachine.lookupSymbolFromChar[o];
};

/**
 * @function FastParser#contextualize
 *
 * @param {string} input - the input stream
 */
FastParser.prototype.contextualize = function(input, endsWithEOF) {
    var self = this, listeners = self.listeners, i = -1, lastState;

    // Perform input stream preprocessing
    // Reference: https://html.spec.whatwg.org/multipage/syntax.html#preprocessing-the-input-stream
    self.input = self.config.enableInputPreProcessing ? input.replace(reInputPreProcessing, function(m){return m[0] === '\r' ? '\n' : '\uFFFD';}) : input;
    self.inputLen = self.input.length;

    while (++i < self.inputLen) {
        lastState = self.state;

        // TODO: endsWithEOF handling
        listeners.preWalk && this.emit(listeners.preWalk, [lastState, i, endsWithEOF]);

        // these functions are not supposed to alter the input
        self.beforeWalk(i, this.input);
        self.walk(i, this.input, endsWithEOF);
        self.afterWalk(i, this.input);

        // TODO: endsWithEOF handling
        listeners.postWalk && this.emit(listeners.postWalk, [lastState, self.state, i, endsWithEOF]);
    }
};

/**
 * @function FastParser#beforeWalk
 *
 * @param {integer} i - the location of the head pointer.
 * @param {string} input - the input stream
 *
 * @description
 * Interface function for subclass to implement logics before parsing the character.
 *
 */
FastParser.prototype.beforeWalk = function (i, input) {};

/**
 * @function FastParser#afterWalk
 *
 * @param {integer} i - the location of the head pointer.
 * @param {string} input - the input stream
 *
 * @description
 * Interface function for subclass to implement logics after parsing the character.
 *
 */
FastParser.prototype.afterWalk = function (i, input) {};

/**
 * @function FastParser#getStartTagName
 * @depreciated Replace it by getCurrentTagIndex and getCurrentTag
 *
 * @returns {string} The current handling start tag name
 *
 */
FastParser.prototype.getStartTagName = function() {
    return this.tags[0] !== undefined? this.tags[0].toLowerCase() : undefined;
};

/**
 * @function FastParser#getCurrentTagIndex
 *
 * @returns {integer} The current handling tag Idx
 *
 */
FastParser.prototype.getCurrentTagIndex = function() {
    return this.tagIdx;
};

/**
 * @function FastParser#getCurrentTag
 *
 * @params {integer} The tag Idx
 *
 * @returns {string} The current tag name indexed by tag Idx
 *
 */
FastParser.prototype.getCurrentTag = function(tagIdx) {
    return tagIdx === 0 || tagIdx === 1? (this.tags[tagIdx] !== undefined? this.tags[tagIdx].toLowerCase():undefined) : undefined;
};

/**
 * @function FastParser#getAttributeName
 *
 * @returns {string} The current handling attribute name.
 *
 * @description
 * Get the current handling attribute name of HTML tag.
 *
 */
FastParser.prototype.getAttributeName = function() {
    return this.attrName.toLowerCase();
};

/**
 * @function FastParser#getAttributeValue
 *
 * @returns {string} The current handling attribute name's value.
 *
 * @description
 * Get the current handling attribute name's value of HTML tag.
 *
 */
FastParser.prototype.getAttributeValue = function(htmlDecoded) {
    // TODO: html decode the attribute value
    return this.attributeValue;
};

/**
* @module Parser
*/
function Parser (config, listeners) {
    var self = this, k;

    config = config || {};

    // config defaulted to false
    config.enableCanonicalization = (config.enableCanonicalization === true);
    config.enableVoidingIEConditionalComments = (config.enableVoidingIEConditionalComments === true);

    // config defaulted to true
    config.enableStateTracking = (config.enableStateTracking !== false);

    // super constructor, reset() is called here
    FastParser.call(self, config);

    // deep copy the provided listeners, if any
    if (typeof listeners === 'object') {
        for (k in listeners) {
            self.listeners[k] = listeners[k].slice();
        }
        return;
    }

    // ### DO NOT CHANGE THE ORDER OF THE FOLLOWING COMPONENTS ###
    // fix parse errors before they're encountered in walk()
    config.enableCanonicalization && self.on('preWalk', Canonicalize).on('reWalk', Canonicalize);
    // enable IE conditional comments
    config.enableVoidingIEConditionalComments && self.on('preWalk', DisableIEConditionalComments);
    // TODO: rewrite IE <comment> tags
    // TODO: When a start tag token is emitted with its self-closing flag set, if the flag is not acknowledged when it is processed by the tree construction stage, that is a parse error.
    // TODO: When an end tag token is emitted with attributes, that is a parse error.
    // TODO: When an end tag token is emitted with its self-closing flag set, that is a parse error.

    // for bookkeeping the processed inputs and states
    if (config.enableStateTracking) {
        self.on('postWalk', function (lastState, state, i, endsWithEOF) {
            this.buffer.push(this.input[i]);
            this.states.push(state);
            this.symbol.push(this._getSymbol(i));
        }).on('reWalk', self.setCurrentState);
    }
}

// as in https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/prototype 
Parser.prototype = Object.create(FastParser.prototype);
Parser.prototype.constructor = Parser;



/**
 * @function Parser#reset
 *
 * @description
 * Reset all internal states, as if being created with the new operator
 */
Parser.prototype.reset = function () {
    var self = this;

    FastParser.prototype.reset.call(self);

    if (self.config.enableStateTracking) {
        self.states = [this.state];
        self.buffer = [];
        self.symbol = [];
    }

    // delete any pending corrections (e.g., to close bogus comment)
    delete self.listeners.preCanonicalize;

    return self;
};


/**
* @function Parser._getSymbol
* @param {integer} i - the index of input stream
*
* @description
* Get the html symbol mapping for the character located in the given index of input stream
*/
Parser.prototype._getSymbol = function (i) {
    return i < this.inputLen ? this.lookupChar(this.input[i]) : -1;
};

/**
* @function Parser._getNextState
* @param {integer} state - the current state
* @param {integer} i - the index of input stream
* @returns {integer} the potential state about to transition into, given the current state and an index of input stream
*
* @description
* Get the potential html state about to transition into
*/
Parser.prototype._getNextState = function (state, i, endsWithEOF) {
    return i < this.inputLen ? stateMachine.lookupStateFromSymbol[this._getSymbol(i)][state] : -1;
};

/**
* @function Parser._convertString2Array
*
* @description
* Convert the immutable this.input to array type for Strict Context Parser processing (lazy conversion).
*
*/
Parser.prototype._convertString2Array = function () {
    if (typeof this.input === "string") this.input = this.input.split('');
};

/**
* @function Parser.fork
* @returns {object} a new parser with all internal states inherited
*
* @description
* create a new parser with all internal states inherited
*/
Parser.prototype.fork = function() {
    var parser = new this.constructor(this.config, this.listeners);

    parser.state = this.state;
    parser.tags = this.tags.slice();
    parser.tagIdx = this.tagIdx;
    parser.attrName = this.attrName;
    parser.attributeValue = this.attributeValue;

    if (this.config.enableStateTracking) {
        parser.buffer = this.buffer.slice();
        parser.states = this.states.slice();
        parser.symbol = this.symbol.slice();
    }
    return parser;
};

/**
 * @function Parser#contextualize
 * @param {string} input - the input stream
 *
 * @description
 * It is the same as the original contextualize() except that this method returns the internal input stream.
 */
Parser.prototype.contextualize = function (input, endsWithEOF) {
    FastParser.prototype.contextualize.call(this, input, endsWithEOF);
    return this.getModifiedInput();
};

/**
 * @function Parser#getModifiedInput
 *
 * @description
 * Get the modified input due to Strict Context Parser processing.
 *
 */
Parser.prototype.getModifiedInput = function() {
    // TODO: it is not defensive enough, should use Array.isArray, but need polyfill
    return (typeof this.input === "string")? this.input:this.input.join('');
};

/**
 * @function Parser#setCurrentState
 *
 * @param {integer} state - The state of HTML5 page.
 *
 * @description
 * Set the current state of the HTML5 Context Parser.
 *
 */
Parser.prototype.setCurrentState = function(state) {
    this.states.pop();
    this.states.push(this.state = state);
    return this;
};

/**
 * @function Parser#getCurrentState
 *
 * @returns {integer} The last state of the HTML5 Context Parser.
 *
 * @description
 * Get the last state of HTML5 Context Parser.
 *
 */
Parser.prototype.getCurrentState = function() {
    return this.state;
};

/**
 * @function Parser#getStates
 *
 * @returns {Array} An array of states.
 *
 * @description
 * Get the states of the HTML5 page
 *
 */
Parser.prototype.getStates = function() {
    return this.states.slice();
};

/**
 * @function Parser#setInitState
 *
 * @param {integer} state - The initial state of the HTML5 Context Parser.
 *
 * @description
 * Set the init state of HTML5 Context Parser.
 *
 */
Parser.prototype.setInitState = function(state) {
    this.states = [state];
    return this;
};

/**
 * @function Parser#getInitState
 *
 * @returns {integer} The initial state of the HTML5 Context Parser.
 *
 * @description
 * Get the init state of HTML5 Context Parser.
 *
 */
Parser.prototype.getInitState = function() {
    return this.states[0];
};

/**
 * @function Parser#getLastState
 *
 * @returns {integer} The last state of the HTML5 Context Parser.
 *
 * @description
 * Get the last state of HTML5 Context Parser.
 *
 */
Parser.prototype.getLastState = function() {
    // * undefined if length = 0 
    return this.states[ this.states.length - 1 ];
};

/**
* The implementation of Strict Context Parser functions
* 
* - ConvertBogusCommentToComment
* - PreCanonicalizeConvertBogusCommentEndTag
* - Canonicalize
* - DisableIEConditionalComments
*
*/

function ConvertBogusCommentToComment(i) {
    // for lazy conversion
    this._convertString2Array();

    // convert !--. i.e., from <* to <!--*
    this.input.splice(i, 0, '!', '-', '-');
    this.inputLen += 3;

    // convert the next > to -->
    this.on('preCanonicalize', PreCanonicalizeConvertBogusCommentEndTag);
}

function PreCanonicalizeConvertBogusCommentEndTag(state, i, endsWithEOF) {
    if (this.input[i] === '>') {
        // remove itself from the listener list
        this.off('preCanonicalize', PreCanonicalizeConvertBogusCommentEndTag);

        // for lazy conversion
        this._convertString2Array();

        // convert [>] to [-]->
        this.input.splice(i, 0, '-', '-');
        this.inputLen += 2;

        this.emit(this.listeners.bogusCommentCoverted, [state, i, endsWithEOF]);
    }
}

// those doctype states (52-67) are initially treated as bogus comment state, but they are further converted to comment state
// Canonicalize() will create no more bogus comment state except the fake (context-parser treats <!doctype as bogus) one hardcoded as <!doctype html> that has no NULL inside
var statesRequiringNullReplacement = [
//    0, 1, 2, 3, 4, 5, 6, 7, 8, 9
/*0*/ 0, 0, 0, 1, 0, 1, 1, 1, 0, 0,
/*1*/ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0,
/*2*/ 0, 0, 1, 1, 1, 0, 0, 0, 0, 1,
/*3*/ 1, 1, 0, 0, 1, 1, 1, 1, 1, 1,
/*4*/ 1, 0, 0, 0, 1, 0, 1, 1, 1, 1,
/*5*/ 1, 1
];
// \uFFFD replacement is not required by the spec for DATA state
statesRequiringNullReplacement[htmlState.STATE_DATA] = 1;

function Canonicalize(state, i, endsWithEOF) {

    this.emit(this.listeners.preCanonicalize, [state, i, endsWithEOF]);

    var reCanonicalizeNeeded = true,
        chr = this.input[i], nextChr = this.input[i+1],
        potentialState = this._getNextState(state, i, endsWithEOF),
        nextPotentialState = this._getNextState(potentialState, i + 1, endsWithEOF);

    // console.log(i, state, potentialState, nextPotentialState, this.input.slice(i).join(''));

    // batch replacement of NULL with \uFFFD would violate the spec
    //  - for example, NULL is untouched in CDATA section state
    if (chr === '\x00' && statesRequiringNullReplacement[state]) {
        // for lazy conversion
        this._convertString2Array();
        this.input[i] = '\uFFFD';
    }
    // encode < into &lt; for [<]* (* is non-alpha) in STATE_DATA, [<]% and [<]! in STATE_RCDATA and STATE_RAWTEXT
    else if ((potentialState === htmlState.STATE_TAG_OPEN && nextPotentialState === htmlState.STATE_DATA) ||  // [<]*, where * is non-alpha
             ((state === htmlState.STATE_RCDATA || state === htmlState.STATE_RAWTEXT) &&                            // in STATE_RCDATA and STATE_RAWTEXT
            chr === '<' && (nextChr === '%' || nextChr === '!'))) {   // [<]% or [<]!
        // for lazy conversion
        this._convertString2Array();

        // [<]*, [<]%, [<]!
        this.input.splice(i, 1, '&', 'l', 't', ';');
        this.inputLen += 3;
    }
    // enforce <!doctype html>
    // + convert bogus comment or unknown doctype to the standard html comment
    else if (potentialState === htmlState.STATE_MARKUP_DECLARATION_OPEN) {            // <[!]***
        reCanonicalizeNeeded = false;

        // for lazy conversion
        this._convertString2Array();

        // context-parser treats the doctype and [CDATA[ as resulting into STATE_BOGUS_COMMENT
        // so, we need our algorithm here to extract and check the next 7 characters
        var commentKey = this.input.slice(i + 1, i + 8).join('');

        // enforce <!doctype html>
        if (commentKey.toLowerCase() === 'doctype') {               // <![d]octype
            // extract 6 chars immediately after <![d]octype and check if it's equal to ' html>'
            if (this.input.slice(i + 8, i + 14).join('').toLowerCase() !== ' html>') {

                // replace <[!]doctype xxxx> with <[!]--!doctype xxxx--><doctype html>
                ConvertBogusCommentToComment.call(this, i);

                this.once('bogusCommentCoverted', function (state, i) {
                    [].splice.apply(this.input, [i + 3, 0].concat('<!doctype html>'.split('')));
                    this.inputLen += 15;
                });

                reCanonicalizeNeeded = true;
            }
        }
        // do not touch <![CDATA[ and <[!]--
        else if (commentKey === '[CDATA[' ||
                    (nextChr === '-' && this.input[i+2] === '-')) {
            // noop
        }
        // ends up in bogus comment
        else {
            // replace <[!]*** with <[!]--***
            // will replace the next > to -->
            ConvertBogusCommentToComment.call(this, i);
            reCanonicalizeNeeded = true;
        }
    }
    // convert bogus comment to the standard html comment
    else if ((state === htmlState.STATE_TAG_OPEN &&
             potentialState === htmlState.STATE_BOGUS_COMMENT) ||           // <[?] only from STATE_TAG_OPEN
            (potentialState === htmlState.STATE_END_TAG_OPEN &&             // <[/]* or <[/]> from STATE_END_TAG_OPEN
             nextPotentialState !== htmlState.STATE_TAG_NAME &&
             nextPotentialState !== -1)) {                                  // TODO: double check if there're any other cases requiring -1 check
        // replace <? and </* respectively with <!--? and <!--/*
        // will replace the next > to -->
        ConvertBogusCommentToComment.call(this, i);
    }
    // remove the unnecessary SOLIDUS
    else if (potentialState === htmlState.STATE_SELF_CLOSING_START_TAG &&             // <***[/]*
            nextPotentialState === htmlState.STATE_BEFORE_ATTRIBUTE_NAME) {           // this.input[i+1] is ANYTHING_ELSE (i.e., not EOF nor >)
        // if ([htmlState.STATE_TAG_NAME,                                             // <a[/]* replaced with <a[ ]*
        //     /* following is unknown to CP
        //     htmlState.STATE_RCDATA_END_TAG_NAME,
        //     htmlState.STATE_RAWTEXT_END_TAG_NAME,
        //     htmlState.STATE_SCRIPT_DATA_END_TAG_NAME,
        //     htmlState.STATE_SCRIPT_DATA_ESCAPED_END_TAG_NAME,
        //     */
        //     htmlState.STATE_BEFORE_ATTRIBUTE_NAME,                                 // <a [/]* replaced with <a [ ]*
        //     htmlState.STATE_AFTER_ATTRIBUTE_VALUE_QUOTED].indexOf(state) !== -1)   // <a abc=""[/]* replaced with <a abc=""[ ]*
   
        // for lazy conversion
        this._convertString2Array();

        this.input[i] = ' ';

        // given this.input[i] was    '/', nextPotentialState was htmlState.STATE_BEFORE_ATTRIBUTE_NAME
        // given this.input[i] is now ' ', nextPotentialState becomes STATE_BEFORE_ATTRIBUTE_NAME if current state is STATE_ATTRIBUTE_NAME or STATE_AFTER_ATTRIBUTE_NAME
        // to preserve state, remove future EQUAL SIGNs (=)s to force STATE_AFTER_ATTRIBUTE_NAME behave as if it is STATE_BEFORE_ATTRIBUTE_NAME
        // this is okay since EQUAL SIGNs (=)s will be stripped anyway in the STATE_BEFORE_ATTRIBUTE_NAME cleanup handling
        if (state === htmlState.STATE_ATTRIBUTE_NAME ||                               // <a abc[/]=abc  replaced with <a abc[ ]*
                state === htmlState.STATE_AFTER_ATTRIBUTE_NAME) {                     // <a abc [/]=abc replaced with <a abc [ ]*
            for (var j = i + 1; j < this.inputLen && this.input[j] === '='; j++) {
                this.input.splice(j, 1);
                this.inputLen--;
            }
        }
    }
    // remove unnecessary equal signs, hence <input checked[=]> become <input checked[>], or <input checked [=]> become <input checked [>]
    else if (potentialState === htmlState.STATE_BEFORE_ATTRIBUTE_VALUE &&   // only from STATE_ATTRIBUTE_NAME or STATE_AFTER_ATTRIBUTE_NAME
            nextPotentialState === htmlState.STATE_DATA) {                  // <a abc[=]> or <a abc [=]>
        // for lazy conversion
        this._convertString2Array();

        this.input.splice(i, 1);
        this.inputLen--;
    }
    // insert a space for <a abc="***["]* or <a abc='***[']* after quoted attribute value (i.e., <a abc="***["] * or <a abc='***['] *)
    else if (potentialState === htmlState.STATE_AFTER_ATTRIBUTE_VALUE_QUOTED &&        // <a abc=""[*] where * is not SPACE (\t,\n,\f,' ')
            nextPotentialState === htmlState.STATE_BEFORE_ATTRIBUTE_NAME &&
            this._getSymbol(i + 1) !== stateMachine.Symbol.SPACE) {
        // for lazy conversion
        this._convertString2Array();

        this.input.splice(i + 1, 0, ' ');
        this.inputLen++;
    }
    // else here means no special pattern was found requiring rewriting
    else {
        reCanonicalizeNeeded = false;
    }

    // remove " ' < = from being treated as part of attribute name (not as the spec recommends though)
    switch (potentialState) {
        case htmlState.STATE_BEFORE_ATTRIBUTE_NAME:     // remove ambigious symbols in <a [*]href where * is ", ', <, or =
            if (nextChr === "=") {
                // for lazy conversion
                this._convertString2Array();

                this.input.splice(i + 1, 1);
                this.inputLen--;
                reCanonicalizeNeeded = true;
                break;
            }
            /* falls through */
        case htmlState.STATE_ATTRIBUTE_NAME:            // remove ambigious symbols in <a href[*] where * is ", ', or <
        case htmlState.STATE_AFTER_ATTRIBUTE_NAME:      // remove ambigious symbols in <a href [*] where * is ", ', or <
            if (nextChr === '"' || nextChr === "'" || nextChr === '<') {
                // for lazy conversion
                this._convertString2Array();

                this.input.splice(i + 1, 1);
                this.inputLen--;
                reCanonicalizeNeeded = true;
            }
            break;
    }

    if (reCanonicalizeNeeded) {
        return Canonicalize.call(this, state, i, endsWithEOF);
    }

    switch (state) {
    // escape " ' < = ` to avoid raising parse errors for unquoted value
        case htmlState.STATE_ATTRIBUTE_VALUE_UNQUOTED:
            if (chr === '"') {
                // for lazy conversion
                this._convertString2Array();

                this.input.splice(i, 1, '&', 'q', 'u', 'o', 't', ';');
                this.inputLen += 5;
                break;
            } else if (chr === "'") {
                // for lazy conversion
                this._convertString2Array();

                this.input.splice(i, 1, '&', '#', '3', '9', ';');
                this.inputLen += 4;
                break;
            }
            /* falls through */
        case htmlState.STATE_BEFORE_ATTRIBUTE_VALUE:     // treat < = ` as if they are in STATE_ATTRIBUTE_VALUE_UNQUOTED
            if (chr === '<') {
                // for lazy conversion
                this._convertString2Array();

                this.input.splice(i, 1, '&', 'l', 't', ';');
                this.inputLen += 3;
            } else if (chr === '=') {
                // for lazy conversion
                this._convertString2Array();

                this.input.splice(i, 1, '&', '#', '6', '1', ';');
                this.inputLen += 4;
            } else if (chr === '`') {
                // for lazy conversion
                this._convertString2Array();

                this.input.splice(i, 1, '&', '#', '9', '6', ';');
                this.inputLen += 4;
            }
            break;

    // add hyphens to complete <!----> to avoid raising parsing errors
        // replace <!--[>] with <!--[-]->
        case htmlState.STATE_COMMENT_START:
            if (chr === '>') {                          // <!--[>]
                // for lazy conversion
                this._convertString2Array();

                this.input.splice(i, 0, '-', '-');
                this.inputLen += 2;
                // reCanonicalizeNeeded = true;  // not need due to no where to treat its potential states
            }
            break;
        // replace <!---[>] with <!---[-]>
        case htmlState.STATE_COMMENT_START_DASH:
            if (chr === '>') {                          // <!---[>]
                // for lazy conversion
                this._convertString2Array();

                this.input.splice(i, 0, '-');
                this.inputLen++;
                // reCanonicalizeNeeded = true;  // not need due to no where to treat its potential states
            }
            break;
    // replace --[!]> with --[>]
        case htmlState.STATE_COMMENT_END:
            if (chr === '!' && nextChr === '>') {
                // for lazy conversion
                this._convertString2Array();

                this.input.splice(i, 1);
                this.inputLen--;
                // reCanonicalizeNeeded = true;  // not need due to no where to treat its potential states
            }
            // if (chr === '-'), ignored this parse error. TODO: consider stripping n-2 hyphens for ------>
            break;
    }

    if (reCanonicalizeNeeded) {
        return Canonicalize.call(this, state, i, endsWithEOF);
    }
}

// remove IE conditional comments
function DisableIEConditionalComments(state, i){
    if (state === htmlState.STATE_COMMENT && this.input[i] === ']' && this.input[i+1] === '>') {
        // for lazy conversion
        this._convertString2Array();

        this.input.splice(i + 1, 0, ' ');
        this.inputLen++;
    }
}

module.exports = {
    Parser: Parser,
    FastParser: FastParser,
    StateMachine: stateMachine
};

})();

},{"./html5-state-machine.js":2}],2:[function(require,module,exports){
/*
Copyright (c) 2015, Yahoo! Inc. All rights reserved.
Copyrights licensed under the New BSD License.
See the accompanying LICENSE file for terms.

Authors: Nera Liu <neraliu@yahoo-inc.com>
         Albert Yu <albertyu@yahoo-inc.com>
         Adonis Fung <adon@yahoo-inc.com>
*/

var StateMachine = {};

// /* Character ASCII map */
// StateMachine.Char = {};
// StateMachine.Char.TAB = 0x09;
// StateMachine.Char.LF = 0x0A;
// StateMachine.Char.FF = 0x0C;
// StateMachine.Char.SPACE = 0x20;
// StateMachine.Char.EXCLAMATION = 0x21;
// StateMachine.Char.DOUBLE_QUOTE = 0x22;
// StateMachine.Char.AMPERSAND = 0x26;
// StateMachine.Char.SINGLE_QUOTE = 0x27;
// StateMachine.Char.DASH = 0x2D;
// StateMachine.Char.SLASH = 0x2F;
// StateMachine.Char.GREATER = 0x3C;
// StateMachine.Char.EQUAL = 0x3D;
// StateMachine.Char.LESS = 0x3E;
// StateMachine.Char.QUESTION = 0x3F;
// StateMachine.Char.CAPTIAL_A = 0x41;
// StateMachine.Char.CAPTIAL_Z = 0x5A;
// StateMachine.Char.SMALL_A = 0x61;
// StateMachine.Char.SMALL_Z = 0x7A;

StateMachine.State = {};

StateMachine.State.STATE_UNKNOWN = 0;
StateMachine.State.STATE_DATA = 1;
StateMachine.State.STATE_RCDATA = 3;
StateMachine.State.STATE_RAWTEXT = 5;
StateMachine.State.STATE_SCRIPT_DATA = 6;
StateMachine.State.STATE_PLAINTEXT = 7;
StateMachine.State.STATE_TAG_OPEN = 8;
StateMachine.State.STATE_END_TAG_OPEN = 9;
StateMachine.State.STATE_TAG_NAME = 10;
StateMachine.State.STATE_RCDATA_LESS_THAN_SIGN = 11;
StateMachine.State.STATE_RCDATA_END_TAG_OPEN = 12;
StateMachine.State.STATE_RCDATA_END_TAG_NAME = 13;
StateMachine.State.STATE_RAWTEXT_LESS_THAN_SIGN = 14;
StateMachine.State.STATE_RAWTEXT_END_TAG_OPEN = 15;
StateMachine.State.STATE_RAWTEXT_END_TAG_NAME = 16;
StateMachine.State.STATE_SCRIPT_DATA_LESS_THAN_SIGN = 17;
StateMachine.State.STATE_SCRIPT_DATA_END_TAG_OPEN = 18;
StateMachine.State.STATE_SCRIPT_DATA_END_TAG_NAME = 19;
StateMachine.State.STATE_SCRIPT_DATA_ESCAPE_START = 20;
StateMachine.State.STATE_SCRIPT_DATA_ESCAPE_START_DASH = 21;
StateMachine.State.STATE_SCRIPT_DATA_ESCAPED = 22;
StateMachine.State.STATE_SCRIPT_DATA_ESCAPED_DASH = 23;
StateMachine.State.STATE_SCRIPT_DATA_ESCAPED_DASH_DASH = 24;
StateMachine.State.STATE_SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN = 25;
StateMachine.State.STATE_SCRIPT_DATA_ESCAPED_END_TAG_OPEN = 26;
StateMachine.State.STATE_SCRIPT_DATA_ESCAPED_END_TAG_NAME = 27;
StateMachine.State.STATE_SCRIPT_DATA_DOUBLE_ESCAPE_START = 28;
StateMachine.State.STATE_SCRIPT_DATA_DOUBLE_ESCAPED = 29;
StateMachine.State.STATE_SCRIPT_DATA_DOUBLE_ESCAPED_DASH = 30;
StateMachine.State.STATE_SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH = 31;
StateMachine.State.STATE_SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN = 32;
StateMachine.State.STATE_SCRIPT_DATA_DOUBLE_ESCAPE_END = 33;
StateMachine.State.STATE_BEFORE_ATTRIBUTE_NAME = 34;
StateMachine.State.STATE_ATTRIBUTE_NAME = 35;
StateMachine.State.STATE_AFTER_ATTRIBUTE_NAME = 36;
StateMachine.State.STATE_BEFORE_ATTRIBUTE_VALUE = 37;
StateMachine.State.STATE_ATTRIBUTE_VALUE_DOUBLE_QUOTED = 38;
StateMachine.State.STATE_ATTRIBUTE_VALUE_SINGLE_QUOTED = 39;
StateMachine.State.STATE_ATTRIBUTE_VALUE_UNQUOTED = 40;
StateMachine.State.STATE_AFTER_ATTRIBUTE_VALUE_QUOTED = 42;
StateMachine.State.STATE_SELF_CLOSING_START_TAG = 43;
StateMachine.State.STATE_BOGUS_COMMENT = 44;
StateMachine.State.STATE_MARKUP_DECLARATION_OPEN = 45;
StateMachine.State.STATE_COMMENT_START = 46;
StateMachine.State.STATE_COMMENT_START_DASH = 47;
StateMachine.State.STATE_COMMENT = 48;
StateMachine.State.STATE_COMMENT_END_DASH = 49;
StateMachine.State.STATE_COMMENT_END = 50;
StateMachine.State.STATE_COMMENT_END_BANG = 51;
StateMachine.State.STATE_DUMMY_RESERVED = 52;
StateMachine.State.STATE_NOT_IN_SPEC_BEFORE_COMMENT_START = 53;

StateMachine.Context = {};
StateMachine.Context.OPERATOR = 0;
StateMachine.Context.HTML = 1;
StateMachine.Context.RCDATA = 2;
StateMachine.Context.RAWTEXT = 3;
StateMachine.Context.SCRIPT = 4;
StateMachine.Context.PLAINTEXT = 5;
StateMachine.Context.TAG_NAME = 6;
StateMachine.Context.ATTRIBUTE_NAME = 7;
StateMachine.Context.ATTRIBUTE_VALUE_DOUBLE_QUOTED = 8;
StateMachine.Context.ATTRIBUTE_VALUE_SINGLE_QUOTED = 9;
StateMachine.Context.ATTRIBUTE_VALUE_UNQUOTED = 10;
StateMachine.Context.COMMENT = 11;
StateMachine.Context.BOGUS_COMMENT = 12;
StateMachine.Context.SCRIPT_COMMENT = 13;
StateMachine.Context.SCRIPT_IN_SCRIPT = 14;

StateMachine.Symbol = {};
StateMachine.Symbol.SPACE = 0;
StateMachine.Symbol.EXCLAMATION = 1;
StateMachine.Symbol.QUOTATION = 2;
StateMachine.Symbol.AMPERSAND = 3;
StateMachine.Symbol.APOSTROPHE = 4;
StateMachine.Symbol.HYPHEN = 5;
StateMachine.Symbol.SOLIDUS = 6;
StateMachine.Symbol.LESS = 7;
StateMachine.Symbol.EQUAL = 8;
StateMachine.Symbol.GREATER = 9;
StateMachine.Symbol.QUESTIONMARK = 10;
StateMachine.Symbol.LETTER = 11;
StateMachine.Symbol.ELSE = 12;

StateMachine.lookupSymbolFromChar = [
    12,12,12,12,12,12,12,12,12, 0,
     0,12, 0,12,12,12,12,12,12,12,
    12,12,12,12,12,12,12,12,12,12,
    12,12, 0, 1, 2,12,12,12, 3, 4,
    12,12,12,12,12, 5,12, 6,12,12,
    12,12,12,12,12,12,12,12,12,12,
     7, 8, 9,10,12,11,11,11,11,11,
    11,11,11,11,11,11,11,11,11,11,
    11,11,11,11,11,11,11,11,11,11,
    11,12,12,12,12,12,12,11,11,11,
    11,11,11,11,11,11,11,11,11,11,
    11,11,11,11,11,11,11,11,11,11,
    11,11,11,12
];

StateMachine.lookupStateFromSymbol = [
 [ 0, 1, 0, 3, 0, 5, 6, 7, 1,44,34, 3, 3, 3, 5, 5, 5, 6, 6, 6, 6, 6,22,22,22,22,22,22,22,29,29,29,29,29,34,36,36,37,38,39,34, 0,34,34,44,44,48,48,48,48,48,48, 0,44],
 [ 0, 1, 0, 3, 0, 5, 6, 7,45,44,10, 3, 3, 3, 5, 5, 5,20, 6, 6, 6, 6,22,22,22,22,22,22,22,29,29,29,29,29,35,35,35,40,38,39,40, 0,34,34,44,44,48,48,48,48,51,48, 0,44],
 [ 0, 1, 0, 3, 0, 5, 6, 7, 1,44,10, 3, 3, 3, 5, 5, 5, 6, 6, 6, 6, 6,22,22,22,22,22,22,22,29,29,29,29,29,35,35,35,38,42,39,40, 0,34,34,44,44,48,48,48,48,48,48, 0,44],
 [ 0, 1, 0, 3, 0, 5, 6, 7, 1,44,10, 3, 3, 3, 5, 5, 5, 6, 6, 6, 6, 6,22,22,22,22,22,22,22,29,29,29,29,29,35,35,35,40,38,39,40, 0,34,34,44,44,48,48,48,48,48,48, 0,44],
 [ 0, 1, 0, 3, 0, 5, 6, 7, 1,44,10, 3, 3, 3, 5, 5, 5, 6, 6, 6, 6, 6,22,22,22,22,22,22,22,29,29,29,29,29,35,35,35,39,38,42,40, 0,34,34,44,44,48,48,48,48,48,48, 0,44],
 [ 0, 1, 0, 3, 0, 5, 6, 7, 1,44,10, 3, 3, 3, 5, 5, 5, 6, 6, 6,21,24,23,24,24,22,22,22,22,30,31,31,29,29,35,35,35,40,38,39,40, 0,34,34,44,53,47,50,49,50,50,49, 0,46],
 [ 0, 1, 0, 3, 0, 5, 6, 7, 9,44,43,12, 3, 3,15, 5, 5,18, 6, 6, 6, 6,22,22,22,26,22,22,22,29,29,29,33,29,43,43,43,40,38,39,40, 0,43,34,44,44,48,48,48,48,48,48, 0,44],
 [ 0, 8, 0,11, 0,14,17, 7, 1,44,10, 3, 3, 3, 5, 5, 5, 6, 6, 6, 6, 6,25,25,25,22,22,22,22,32,32,32,29,29,35,35,35,40,38,39,40, 0,34,34,44,44,48,48,48,48,48,48, 0,44],
 [ 0, 1, 0, 3, 0, 5, 6, 7, 1,44,10, 3, 3, 3, 5, 5, 5, 6, 6, 6, 6, 6,22,22,22,22,22,22,22,29,29,29,29,29,35,37,37,40,38,39,40, 0,34,34,44,44,48,48,48,48,48,48, 0,44],
 [ 0, 1, 0, 3, 0, 5, 6, 7, 1, 1, 1, 3, 3, 3, 5, 5, 5, 6, 6, 6, 6, 6,22,22, 6,22,22,22,22,29,29, 6,29,29, 1, 1, 1, 1,38,39, 1, 0, 1, 1, 1,44, 1, 1,48,48, 1, 1, 0,44],
 [ 0, 1, 0, 3, 0, 5, 6, 7,44,44,10, 3, 3, 3, 5, 5, 5, 6, 6, 6, 6, 6,22,22,22,22,22,22,22,29,29,29,29,29,35,35,35,40,38,39,40, 0,34,34,44,44,48,48,48,48,48,48, 0,44],
 [ 0, 1, 0, 3, 0, 5, 6, 7,10,10,10, 3,13,13, 5,16,16, 6,19,19, 6, 6,22,22,22,28,27,27,28,29,29,29,29,33,35,35,35,40,38,39,40, 0,34,34,44,44,48,48,48,48,48,48, 0,44],
 [ 0, 1, 0, 3, 0, 5, 6, 7, 1,44,10, 3, 3, 3, 5, 5, 5, 6, 6, 6, 6, 6,22,22,22,22,22,22,22,29,29,29,29,29,35,35,35,40,38,39,40, 0,34,34,44,44,48,48,48,48,48,48, 0,44]
];
  
StateMachine.lookupAltLogicFromSymbol = [
 [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 6, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 6, 8, 0, 0, 0, 0, 8, 0, 0, 0, 0,14,14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,12,13,12,14,14,14,14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,12,13,12, 0, 0,14,14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,12,13,12, 0,14,14,14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,12,13,12, 0,14, 0,14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,12,13,12,14,14,14,14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 6, 4, 0, 6, 4, 0, 6, 0, 0, 0, 0, 0, 4, 0, 6, 8, 0, 0, 0, 4, 8, 0, 0, 0,14,14,14,14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,12,13,12,14,14,14,14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,12, 0, 0,14,14,14,14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,11, 0, 0, 6, 0, 0, 6, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 6, 8, 0, 0, 0, 0, 8,11,11,11,11,14,14,11, 0,11,11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,12,13,12,14,14,14,14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 2, 3, 0, 2, 3, 0, 2, 3, 0, 0, 0, 0, 0, 2, 2, 3, 3, 0, 0, 0, 0, 3,12,13,12,14,14,14,14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,12,13,12,14,14,14,14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
];

StateMachine.lookupReconsumeFromSymbol = [
 [ 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
 [ 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1]
];

// key is the "previous" state, key in the value object is "next" state and its value indicates what action we should take. For example, the first line indicates previous state is 1, next state is 1 and return value is 1 (and we'd have logic to add the character to output stream when return value is 1)
StateMachine.lookupContext = [
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];

module.exports = StateMachine;
},{}],3:[function(require,module,exports){
(function (process){
/* parser generated by jison 0.4.15 */
/*
  Returns a Parser object of the following structure:

  Parser: {
    yy: {}
  }

  Parser.prototype: {
    yy: {},
    trace: function(),
    symbols_: {associative list: name ==> number},
    terminals_: {associative list: number ==> name},
    productions_: [...],
    performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate, $$, _$),
    table: [...],
    defaultActions: {...},
    parseError: function(str, hash),
    parse: function(input),

    lexer: {
        EOF: 1,
        parseError: function(str, hash),
        setInput: function(input),
        input: function(),
        unput: function(str),
        more: function(),
        less: function(n),
        pastInput: function(),
        upcomingInput: function(),
        showPosition: function(),
        test_match: function(regex_match_array, rule_index),
        next: function(),
        lex: function(),
        begin: function(condition),
        popState: function(),
        _currentRules: function(),
        topState: function(),
        pushState: function(condition),

        options: {
            ranges: boolean           (optional: true ==> token location info will include a .range[] member)
            flex: boolean             (optional: true ==> flex-like lexing behaviour where the rules are tested exhaustively to find the longest match)
            backtrack_lexer: boolean  (optional: true ==> lexer regexes are tested in order and for each matching regex the action code is invoked; the lexer terminates the scan when a token is returned by the action code)
        },

        performAction: function(yy, yy_, $avoiding_name_collisions, YY_START),
        rules: [...],
        conditions: {associative list: name ==> set},
    }
  }


  token location info (@$, _$, etc.): {
    first_line: n,
    last_line: n,
    first_column: n,
    last_column: n,
    range: [start_number, end_number]       (where the numbers are indexes into the input string, regular zero-based)
  }


  the parseError function receives a 'hash' object with these members for lexer and parser errors: {
    text:        (matched text)
    token:       (the produced terminal token, if any)
    line:        (yylineno)
  }
  while parser (grammar) errors will also provide these members, i.e. parser errors deliver a superset of attributes: {
    loc:         (yylloc)
    expected:    (string describing the set of expected tokens)
    recoverable: (boolean: TRUE when the parser has a error recovery rule available for this particular error)
  }
*/
var parser = (function(){
var o=function(k,v,o,l){for(o=o||{},l=k.length;l--;o[k[l]]=v);return o},$V0=[1,11,12],$V1=[2,37],$V2=[1,4],$V3=[1,11],$V4=[2,4],$V5=[1,7],$V6=[1,8,11,12,19,20,21,22,23,24,25,26,27,28,31,32,33,34,36,37,38,39,40],$V7=[12,19,20,21,22,23,24,25,26,27,28,32,34,37,38],$V8=[1,34],$V9=[1,23],$Va=[1,24],$Vb=[1,25],$Vc=[1,26],$Vd=[1,27],$Ve=[1,28],$Vf=[1,29],$Vg=[1,30],$Vh=[1,33],$Vi=[1,35],$Vj=[1,39],$Vk=[1,38],$Vl=[1,31],$Vm=[1,32],$Vn=[1,11,31,33],$Vo=[1,46],$Vp=[1,47],$Vq=[1,11,12,19,20,21,22,23,24,25,26,27,28,31,32,33,34,37,38,39,40],$Vr=[19,20,21,22,23,24,25,26],$Vs=[1,11,12,19,20,21,22,23,24,25,26,27,28,31,32,33,34,36,37,38,39,40];
var parser = {trace: function trace() { },
yy: {},
symbols_: {"error":2,"style_attribute":3,"space_or_empty":4,"declarations":5,"declaration_list":6,"property":7,":":8,"expr":9,"prio":10,";":11,"IDENT":12,"term":13,"term_list":14,"operator":15,"numeric_term":16,"unary_operator":17,"string_term":18,"NUMBER":19,"PERCENTAGE":20,"LENGTH":21,"EMS":22,"EXS":23,"ANGLE":24,"TIME":25,"FREQ":26,"STRING":27,"URI":28,"hexcolor":29,"function":30,"IMPORTANT_SYM":31,"FUNCTION":32,")":33,"HASH":34,"at_least_one_space":35,"S":36,"+":37,"-":38,"/":39,",":40,"$accept":0,"$end":1},
terminals_: {2:"error",8:":",11:";",12:"IDENT",19:"NUMBER",20:"PERCENTAGE",21:"LENGTH",22:"EMS",23:"EXS",24:"ANGLE",25:"TIME",26:"FREQ",27:"STRING",28:"URI",31:"IMPORTANT_SYM",32:"FUNCTION",33:")",34:"HASH",36:"S",37:"+",38:"-",39:"/",40:","},
productions_: [0,[3,3],[5,4],[5,5],[5,0],[6,3],[6,4],[6,0],[7,2],[9,2],[14,1],[14,2],[14,2],[14,3],[14,0],[13,1],[13,2],[13,1],[16,2],[16,2],[16,2],[16,2],[16,2],[16,2],[16,2],[16,2],[18,2],[18,2],[18,2],[18,2],[18,2],[10,2],[30,5],[29,2],[35,1],[35,2],[4,1],[4,0],[17,1],[17,1],[15,2],[15,2]],
performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate /* action[1] */, $$ /* vstack */, _$ /* lstack */) {
/* this == yyval */

var $0 = $$.length - 1;
switch (yystate) {
case 1:

      this.$ = [];
      var r = this.$;
      $$[$0-1] !== null? this.$.push($$[$0-1]) : '';
      $$[$0] !== null? $$[$0].forEach(function(e) { r.push(e); }) : ''
      return this.$;
    
break;
case 2:

      this.$ = {};
      this.$.key = $$[$0-3];
      this.$.value = $$[$0];
    
break;
case 3:

      this.$ = {};
      this.$.key = $$[$0-4];
      this.$.value = $$[$0-1] + ' ' + $$[$0];				/* TODO: should i need to add a space */
    
break;
case 4: case 7: case 14:
this.$ = null;
break;
case 5:

      this.$ = [];
      if ($$[$0] !== null) this.$.push($$[$0]);
    
break;
case 6:

      this.$ = [];
      this.$ = $$[$0-3];
      if ($$[$0] !== null) this.$.push($$[$0]);
    
break;
case 8: case 20: case 21: case 22: case 23: case 24: case 25: case 26: case 27: case 28: case 29: case 30: case 31: case 33: case 40: case 41:
this.$ = $$[$0-1];
break;
case 9:

      this.$ = $$[$0-1];
      if ($$[$0] !== null) this.$ = $$[$0-1] + ' ' + $$[$0];
    
break;
case 10: case 15: case 17: case 36: case 38: case 39:
this.$ = $$[$0];
break;
case 11: case 16:
this.$ = $$[$0-1] + $$[$0];
break;
case 12:
this.$ = $$[$0-1] + ' ' + $$[$0];
break;
case 13:
this.$ = $$[$0-2] + ' ' + $$[$0-1] + $$[$0];
break;
case 18: case 19:
this.$ = $$[$0-1] ;
break;
case 32:
this.$ = $$[$0-4] + $$[$0-2] + $$[$0-1];
break;
case 34: case 35:
this.$ = " ";
break;
case 37:
this.$ = "";
break;
}
},
table: [o($V0,$V1,{3:1,4:2,35:3,36:$V2}),{1:[3]},o($V3,$V4,{5:5,7:6,12:$V5}),o([1,8,11,12,19,20,21,22,23,24,25,26,27,28,31,32,33,34,37,38,39,40],[2,36],{36:[1,8]}),o($V6,[2,34]),{1:[2,7],6:9,11:[1,10]},{8:$V3},{4:12,8:$V1,35:3,36:$V2},o($V6,[2,35]),{1:[2,1],11:[1,13]},o($V0,$V1,{35:3,4:14,36:$V2}),o($V7,$V1,{35:3,4:15,36:$V2}),{8:[2,8]},o($V0,$V1,{35:3,4:16,36:$V2}),o($V3,$V4,{7:6,5:17,12:$V5}),{9:18,12:$V8,13:19,16:20,17:21,18:22,19:$V9,20:$Va,21:$Vb,22:$Vc,23:$Vd,24:$Ve,25:$Vf,26:$Vg,27:$Vh,28:$Vi,29:36,30:37,32:$Vj,34:$Vk,37:$Vl,38:$Vm},o($V3,$V4,{7:6,5:40,12:$V5}),o($V3,[2,5]),o($V3,[2,2],{10:41,31:[1,42]}),o($Vn,[2,14],{16:20,17:21,18:22,29:36,30:37,14:43,13:44,15:45,12:$V8,19:$V9,20:$Va,21:$Vb,22:$Vc,23:$Vd,24:$Ve,25:$Vf,26:$Vg,27:$Vh,28:$Vi,32:$Vj,34:$Vk,37:$Vl,38:$Vm,39:$Vo,40:$Vp}),o($Vq,[2,15]),{16:48,19:$V9,20:$Va,21:$Vb,22:$Vc,23:$Vd,24:$Ve,25:$Vf,26:$Vg},o($Vq,[2,17]),o($Vq,$V1,{35:3,4:49,36:$V2}),o($Vq,$V1,{35:3,4:50,36:$V2}),o($Vq,$V1,{35:3,4:51,36:$V2}),o($Vq,$V1,{35:3,4:52,36:$V2}),o($Vq,$V1,{35:3,4:53,36:$V2}),o($Vq,$V1,{35:3,4:54,36:$V2}),o($Vq,$V1,{35:3,4:55,36:$V2}),o($Vq,$V1,{35:3,4:56,36:$V2}),o($Vr,[2,38]),o($Vr,[2,39]),o($Vq,$V1,{35:3,4:57,36:$V2}),o($Vq,$V1,{35:3,4:58,36:$V2}),o($Vq,$V1,{35:3,4:59,36:$V2}),o($Vq,$V1,{35:3,4:60,36:$V2}),o($Vq,$V1,{35:3,4:61,36:$V2}),o($Vq,$V1,{35:3,4:62,36:$V2}),o($V7,$V1,{35:3,4:63,36:$V2}),o($V3,[2,6]),o($V3,[2,3]),o($V3,$V1,{35:3,4:64,36:$V2}),o($Vn,[2,9],{16:20,17:21,18:22,29:36,30:37,13:65,15:66,12:$V8,19:$V9,20:$Va,21:$Vb,22:$Vc,23:$Vd,24:$Ve,25:$Vf,26:$Vg,27:$Vh,28:$Vi,32:$Vj,34:$Vk,37:$Vl,38:$Vm,39:$Vo,40:$Vp}),o($Vq,[2,10]),{12:$V8,13:67,16:20,17:21,18:22,19:$V9,20:$Va,21:$Vb,22:$Vc,23:$Vd,24:$Ve,25:$Vf,26:$Vg,27:$Vh,28:$Vi,29:36,30:37,32:$Vj,34:$Vk,37:$Vl,38:$Vm},o($V7,$V1,{35:3,4:68,36:$V2}),o($V7,$V1,{35:3,4:69,36:$V2}),o($Vq,[2,16]),o($Vq,[2,18]),o($Vq,[2,19]),o($Vq,[2,20]),o($Vq,[2,21]),o($Vq,[2,22]),o($Vq,[2,23]),o($Vq,[2,24]),o($Vq,[2,25]),o($Vq,[2,26]),o($Vq,[2,27]),o($Vq,[2,28]),o($Vq,[2,29]),o($Vq,[2,30]),o($Vs,[2,33]),{9:70,12:$V8,13:19,16:20,17:21,18:22,19:$V9,20:$Va,21:$Vb,22:$Vc,23:$Vd,24:$Ve,25:$Vf,26:$Vg,27:$Vh,28:$Vi,29:36,30:37,32:$Vj,34:$Vk,37:$Vl,38:$Vm},o($V3,[2,31]),o($Vq,[2,12]),{12:$V8,13:71,16:20,17:21,18:22,19:$V9,20:$Va,21:$Vb,22:$Vc,23:$Vd,24:$Ve,25:$Vf,26:$Vg,27:$Vh,28:$Vi,29:36,30:37,32:$Vj,34:$Vk,37:$Vl,38:$Vm},o($Vq,[2,11]),o($V7,[2,40]),o($V7,[2,41]),{33:[1,72]},o($Vq,[2,13]),o($Vq,$V1,{35:3,4:73,36:$V2}),o($Vs,[2,32])],
defaultActions: {12:[2,8]},
parseError: function parseError(str, hash) {
    if (hash.recoverable) {
        this.trace(str);
    } else {
        throw new Error(str);
    }
},
parse: function parse(input) {
    var self = this, stack = [0], tstack = [], vstack = [null], lstack = [], table = this.table, yytext = '', yylineno = 0, yyleng = 0, recovering = 0, TERROR = 2, EOF = 1;
    var args = lstack.slice.call(arguments, 1);
    var lexer = Object.create(this.lexer);
    var sharedState = { yy: {} };
    for (var k in this.yy) {
        if (Object.prototype.hasOwnProperty.call(this.yy, k)) {
            sharedState.yy[k] = this.yy[k];
        }
    }
    lexer.setInput(input, sharedState.yy);
    sharedState.yy.lexer = lexer;
    sharedState.yy.parser = this;
    if (typeof lexer.yylloc == 'undefined') {
        lexer.yylloc = {};
    }
    var yyloc = lexer.yylloc;
    lstack.push(yyloc);
    var ranges = lexer.options && lexer.options.ranges;
    if (typeof sharedState.yy.parseError === 'function') {
        this.parseError = sharedState.yy.parseError;
    } else {
        this.parseError = Object.getPrototypeOf(this).parseError;
    }
    function popStack(n) {
        stack.length = stack.length - 2 * n;
        vstack.length = vstack.length - n;
        lstack.length = lstack.length - n;
    }
    _token_stack:
        function lex() {
            var token;
            token = lexer.lex() || EOF;
            if (typeof token !== 'number') {
                token = self.symbols_[token] || token;
            }
            return token;
        }
    var symbol, preErrorSymbol, state, action, a, r, yyval = {}, p, len, newState, expected;
    while (true) {
        state = stack[stack.length - 1];
        if (this.defaultActions[state]) {
            action = this.defaultActions[state];
        } else {
            if (symbol === null || typeof symbol == 'undefined') {
                symbol = lex();
            }
            action = table[state] && table[state][symbol];
        }
                    if (typeof action === 'undefined' || !action.length || !action[0]) {
                var errStr = '';
                expected = [];
                for (p in table[state]) {
                    if (this.terminals_[p] && p > TERROR) {
                        expected.push('\'' + this.terminals_[p] + '\'');
                    }
                }
                if (lexer.showPosition) {
                    errStr = 'Parse error on line ' + (yylineno + 1) + ':\n' + lexer.showPosition() + '\nExpecting ' + expected.join(', ') + ', got \'' + (this.terminals_[symbol] || symbol) + '\'';
                } else {
                    errStr = 'Parse error on line ' + (yylineno + 1) + ': Unexpected ' + (symbol == EOF ? 'end of input' : '\'' + (this.terminals_[symbol] || symbol) + '\'');
                }
                this.parseError(errStr, {
                    text: lexer.match,
                    token: this.terminals_[symbol] || symbol,
                    line: lexer.yylineno,
                    loc: yyloc,
                    expected: expected
                });
            }
        if (action[0] instanceof Array && action.length > 1) {
            throw new Error('Parse Error: multiple actions possible at state: ' + state + ', token: ' + symbol);
        }
        switch (action[0]) {
        case 1:
            stack.push(symbol);
            vstack.push(lexer.yytext);
            lstack.push(lexer.yylloc);
            stack.push(action[1]);
            symbol = null;
            if (!preErrorSymbol) {
                yyleng = lexer.yyleng;
                yytext = lexer.yytext;
                yylineno = lexer.yylineno;
                yyloc = lexer.yylloc;
                if (recovering > 0) {
                    recovering--;
                }
            } else {
                symbol = preErrorSymbol;
                preErrorSymbol = null;
            }
            break;
        case 2:
            len = this.productions_[action[1]][1];
            yyval.$ = vstack[vstack.length - len];
            yyval._$ = {
                first_line: lstack[lstack.length - (len || 1)].first_line,
                last_line: lstack[lstack.length - 1].last_line,
                first_column: lstack[lstack.length - (len || 1)].first_column,
                last_column: lstack[lstack.length - 1].last_column
            };
            if (ranges) {
                yyval._$.range = [
                    lstack[lstack.length - (len || 1)].range[0],
                    lstack[lstack.length - 1].range[1]
                ];
            }
            r = this.performAction.apply(yyval, [
                yytext,
                yyleng,
                yylineno,
                sharedState.yy,
                action[1],
                vstack,
                lstack
            ].concat(args));
            if (typeof r !== 'undefined') {
                return r;
            }
            if (len) {
                stack = stack.slice(0, -1 * len * 2);
                vstack = vstack.slice(0, -1 * len);
                lstack = lstack.slice(0, -1 * len);
            }
            stack.push(this.productions_[action[1]][0]);
            vstack.push(yyval.$);
            lstack.push(yyval._$);
            newState = table[stack[stack.length - 2]][stack[stack.length - 1]];
            stack.push(newState);
            break;
        case 3:
            return true;
        }
    }
    return true;
}};
/* generated by jison-lex 0.3.4 */
var lexer = (function(){
var lexer = ({

EOF:1,

parseError:function parseError(str, hash) {
        if (this.yy.parser) {
            this.yy.parser.parseError(str, hash);
        } else {
            throw new Error(str);
        }
    },

// resets the lexer, sets new input
setInput:function (input, yy) {
        this.yy = yy || this.yy || {};
        this._input = input;
        this._more = this._backtrack = this.done = false;
        this.yylineno = this.yyleng = 0;
        this.yytext = this.matched = this.match = '';
        this.conditionStack = ['INITIAL'];
        this.yylloc = {
            first_line: 1,
            first_column: 0,
            last_line: 1,
            last_column: 0
        };
        if (this.options.ranges) {
            this.yylloc.range = [0,0];
        }
        this.offset = 0;
        return this;
    },

// consumes and returns one char from the input
input:function () {
        var ch = this._input[0];
        this.yytext += ch;
        this.yyleng++;
        this.offset++;
        this.match += ch;
        this.matched += ch;
        var lines = ch.match(/(?:\r\n?|\n).*/g);
        if (lines) {
            this.yylineno++;
            this.yylloc.last_line++;
        } else {
            this.yylloc.last_column++;
        }
        if (this.options.ranges) {
            this.yylloc.range[1]++;
        }

        this._input = this._input.slice(1);
        return ch;
    },

// unshifts one char (or a string) into the input
unput:function (ch) {
        var len = ch.length;
        var lines = ch.split(/(?:\r\n?|\n)/g);

        this._input = ch + this._input;
        this.yytext = this.yytext.substr(0, this.yytext.length - len);
        //this.yyleng -= len;
        this.offset -= len;
        var oldLines = this.match.split(/(?:\r\n?|\n)/g);
        this.match = this.match.substr(0, this.match.length - 1);
        this.matched = this.matched.substr(0, this.matched.length - 1);

        if (lines.length - 1) {
            this.yylineno -= lines.length - 1;
        }
        var r = this.yylloc.range;

        this.yylloc = {
            first_line: this.yylloc.first_line,
            last_line: this.yylineno + 1,
            first_column: this.yylloc.first_column,
            last_column: lines ?
                (lines.length === oldLines.length ? this.yylloc.first_column : 0)
                 + oldLines[oldLines.length - lines.length].length - lines[0].length :
              this.yylloc.first_column - len
        };

        if (this.options.ranges) {
            this.yylloc.range = [r[0], r[0] + this.yyleng - len];
        }
        this.yyleng = this.yytext.length;
        return this;
    },

// When called from action, caches matched text and appends it on next action
more:function () {
        this._more = true;
        return this;
    },

// When called from action, signals the lexer that this rule fails to match the input, so the next matching rule (regex) should be tested instead.
reject:function () {
        if (this.options.backtrack_lexer) {
            this._backtrack = true;
        } else {
            return this.parseError('Lexical error on line ' + (this.yylineno + 1) + '. You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).\n' + this.showPosition(), {
                text: "",
                token: null,
                line: this.yylineno
            });

        }
        return this;
    },

// retain first n characters of the match
less:function (n) {
        this.unput(this.match.slice(n));
    },

// displays already matched input, i.e. for error messages
pastInput:function () {
        var past = this.matched.substr(0, this.matched.length - this.match.length);
        return (past.length > 20 ? '...':'') + past.substr(-20).replace(/\n/g, "");
    },

// displays upcoming input, i.e. for error messages
upcomingInput:function () {
        var next = this.match;
        if (next.length < 20) {
            next += this._input.substr(0, 20-next.length);
        }
        return (next.substr(0,20) + (next.length > 20 ? '...' : '')).replace(/\n/g, "");
    },

// displays the character position where the lexing error occurred, i.e. for error messages
showPosition:function () {
        var pre = this.pastInput();
        var c = new Array(pre.length + 1).join("-");
        return pre + this.upcomingInput() + "\n" + c + "^";
    },

// test the lexed token: return FALSE when not a match, otherwise return token
test_match:function (match, indexed_rule) {
        var token,
            lines,
            backup;

        if (this.options.backtrack_lexer) {
            // save context
            backup = {
                yylineno: this.yylineno,
                yylloc: {
                    first_line: this.yylloc.first_line,
                    last_line: this.last_line,
                    first_column: this.yylloc.first_column,
                    last_column: this.yylloc.last_column
                },
                yytext: this.yytext,
                match: this.match,
                matches: this.matches,
                matched: this.matched,
                yyleng: this.yyleng,
                offset: this.offset,
                _more: this._more,
                _input: this._input,
                yy: this.yy,
                conditionStack: this.conditionStack.slice(0),
                done: this.done
            };
            if (this.options.ranges) {
                backup.yylloc.range = this.yylloc.range.slice(0);
            }
        }

        lines = match[0].match(/(?:\r\n?|\n).*/g);
        if (lines) {
            this.yylineno += lines.length;
        }
        this.yylloc = {
            first_line: this.yylloc.last_line,
            last_line: this.yylineno + 1,
            first_column: this.yylloc.last_column,
            last_column: lines ?
                         lines[lines.length - 1].length - lines[lines.length - 1].match(/\r?\n?/)[0].length :
                         this.yylloc.last_column + match[0].length
        };
        this.yytext += match[0];
        this.match += match[0];
        this.matches = match;
        this.yyleng = this.yytext.length;
        if (this.options.ranges) {
            this.yylloc.range = [this.offset, this.offset += this.yyleng];
        }
        this._more = false;
        this._backtrack = false;
        this._input = this._input.slice(match[0].length);
        this.matched += match[0];
        token = this.performAction.call(this, this.yy, this, indexed_rule, this.conditionStack[this.conditionStack.length - 1]);
        if (this.done && this._input) {
            this.done = false;
        }
        if (token) {
            return token;
        } else if (this._backtrack) {
            // recover context
            for (var k in backup) {
                this[k] = backup[k];
            }
            return false; // rule action called reject() implying the next rule should be tested instead.
        }
        return false;
    },

// return next match in input
next:function () {
        if (this.done) {
            return this.EOF;
        }
        if (!this._input) {
            this.done = true;
        }

        var token,
            match,
            tempMatch,
            index;
        if (!this._more) {
            this.yytext = '';
            this.match = '';
        }
        var rules = this._currentRules();
        for (var i = 0; i < rules.length; i++) {
            tempMatch = this._input.match(this.rules[rules[i]]);
            if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
                match = tempMatch;
                index = i;
                if (this.options.backtrack_lexer) {
                    token = this.test_match(tempMatch, rules[i]);
                    if (token !== false) {
                        return token;
                    } else if (this._backtrack) {
                        match = false;
                        continue; // rule action called reject() implying a rule MISmatch.
                    } else {
                        // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
                        return false;
                    }
                } else if (!this.options.flex) {
                    break;
                }
            }
        }
        if (match) {
            token = this.test_match(match, rules[index]);
            if (token !== false) {
                return token;
            }
            // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
            return false;
        }
        if (this._input === "") {
            return this.EOF;
        } else {
            return this.parseError('Lexical error on line ' + (this.yylineno + 1) + '. Unrecognized text.\n' + this.showPosition(), {
                text: "",
                token: null,
                line: this.yylineno
            });
        }
    },

// return next match that has a token
lex:function lex() {
        var r = this.next();
        if (r) {
            return r;
        } else {
            return this.lex();
        }
    },

// activates a new lexer condition state (pushes the new lexer condition state onto the condition stack)
begin:function begin(condition) {
        this.conditionStack.push(condition);
    },

// pop the previously active lexer condition state off the condition stack
popState:function popState() {
        var n = this.conditionStack.length - 1;
        if (n > 0) {
            return this.conditionStack.pop();
        } else {
            return this.conditionStack[0];
        }
    },

// produce the lexer rule set which is active for the currently active lexer condition state
_currentRules:function _currentRules() {
        if (this.conditionStack.length && this.conditionStack[this.conditionStack.length - 1]) {
            return this.conditions[this.conditionStack[this.conditionStack.length - 1]].rules;
        } else {
            return this.conditions["INITIAL"].rules;
        }
    },

// return the currently active lexer condition state; when an index argument is provided it produces the N-th previous condition state, if available
topState:function topState(n) {
        n = this.conditionStack.length - 1 - Math.abs(n || 0);
        if (n >= 0) {
            return this.conditionStack[n];
        } else {
            return "INITIAL";
        }
    },

// alias for begin(condition)
pushState:function pushState(condition) {
        this.begin(condition);
    },

// return the number of states currently on the stack
stateStackSize:function stateStackSize() {
        return this.conditionStack.length;
    },
options: {},
performAction: function anonymous(yy,yy_,$avoiding_name_collisions,YY_START) {
var YYSTATE=YY_START;
switch($avoiding_name_collisions) {
case 0:return 36;
break;
case 1:
break;
case 2:
break;
case 3:return 'CDO';
break;
case 4:return 'CDC';
break;
case 5:return 'INCLUDES';
break;
case 6:return 'DASHMATCH';
break;
case 7:return 27;
break;
case 8:return 'BAD_STRING';
break;
case 9:return 28;
break;
case 10:return 28;
break;
case 11:return 'BAD_URI';
break;
case 12:return 31;
break;
case 13:return 'IMPORT_SYM';
break;
case 14:return 'PAGE_SYM';
break;
case 15:return 'MEDIA_SYM';
break;
case 16:return 'CHARSET_SYM';
break;
case 17:return 'UNICODERANGE';
break;
case 18:return 32;
break;
case 19:return 12;
break;
case 20:return 'VENDOR';
break;
case 21:return 'ATKEYWORD';
break;
case 22:return 34;
break;
case 23:return 22;
break;
case 24:return 23;
break;
case 25:return 21;
break;
case 26:return 21;
break;
case 27:return 21;
break;
case 28:return 21;
break;
case 29:return 21;
break;
case 30:return 21;
break;
case 31:return 24;
break;
case 32:return 24;
break;
case 33:return 24;
break;
case 34:return 25;
break;
case 35:return 25;
break;
case 36:return 26;
break;
case 37:return 26;
break;
case 38:return 'DIMENSION';
break;
case 39:return 20;
break;
case 40:return 19;
break;
case 41:return yy_.yytext; /* 'DELIM'; */
break;
}
},
rules: [/^(?:([ \t\r\n\f]+))/,/^(?:\/\*[^*]*\*+([^/*][^*]*\*+)*\/)/,/^(?:((\/\*[^*]*\*+([^/*][^*]*\*+)*)|(\/\*[^*]*(\*+[^/*][^*]*)*)))/,/^(?:<!--)/,/^(?:-->)/,/^(?:~=)/,/^(?:\|=)/,/^(?:(("([^\n\r\f\\"]|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*")|('([^\n\r\f\\']|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*')))/,/^(?:(("([^\n\r\f\\"]|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*\\?)|('([^\n\r\f\\']|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*\\?)))/,/^(?:url\((([ \t\r\n\f]+)?)(("([^\n\r\f\\"]|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*")|('([^\n\r\f\\']|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*'))(([ \t\r\n\f]+)?)\))/,/^(?:url\((([ \t\r\n\f]+)?)(([!#$%&*-~]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*)(([ \t\r\n\f]+)?)\))/,/^(?:((url\((([ \t\r\n\f]+)?)([!#$%&*-\[\]-~]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*(([ \t\r\n\f]+)?))|(url\((([ \t\r\n\f]+)?)(("([^\n\r\f\\"]|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*")|('([^\n\r\f\\']|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*'))(([ \t\r\n\f]+)?))|(url\((([ \t\r\n\f]+)?)(("([^\n\r\f\\"]|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*\\?)|('([^\n\r\f\\']|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*\\?)))))/,/^(?:!((([ \t\r\n\f]+)?)|(\/\*[^*]*\*+([^/*][^*]*\*+)*\/))*(I|i|\\0{0,4}(49|69)(\r\n|[ \t\r\n\f])?|\\[i])(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m])(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(O|o|\\0{0,4}(4f|6f)(\r\n|[ \t\r\n\f])?|\\[o])(R|r|\\0{0,4}(52|72)(\r\n|[ \t\r\n\f])?|\\[r])(T|t|\\0{0,4}(54|74)(\r\n|[ \t\r\n\f])?|\\[t])(A|a|\\0{0,4}(41|61)(\r\n|[ \t\r\n\f])?)(N|n|\\0{0,4}(4e|6e)(\r\n|[ \t\r\n\f])?|\\[n])(T|t|\\0{0,4}(54|74)(\r\n|[ \t\r\n\f])?|\\[t]))/,/^(?:@(I|i|\\0{0,4}(49|69)(\r\n|[ \t\r\n\f])?|\\[i])(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m])(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(O|o|\\0{0,4}(4f|6f)(\r\n|[ \t\r\n\f])?|\\[o])(R|r|\\0{0,4}(52|72)(\r\n|[ \t\r\n\f])?|\\[r])(T|t|\\0{0,4}(54|74)(\r\n|[ \t\r\n\f])?|\\[t]))/,/^(?:@(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(A|a|\\0{0,4}(41|61)(\r\n|[ \t\r\n\f])?)(G|g|\\0{0,4}(47|67)(\r\n|[ \t\r\n\f])?|\\[g])(E|e|\\0{0,4}(45|65)(\r\n|[ \t\r\n\f])?))/,/^(?:@(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m])(E|e|\\0{0,4}(45|65)(\r\n|[ \t\r\n\f])?)(D|d|\\0{0,4}(44|64)(\r\n|[ \t\r\n\f])?)(I|i|\\0{0,4}(49|69)(\r\n|[ \t\r\n\f])?|\\[i])(A|a|\\0{0,4}(41|61)(\r\n|[ \t\r\n\f])?))/,/^(?:@charset )/,/^(?:(U|u|\\0{0,4}(55|75)(\r\n|[ \t\r\n\f])?|\\[u])\+([0-9a-fA-F?]{1,6}(-[0-9a-fA-F]{1,6})?))/,/^(?:([\-]?([_a-zA-Z]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))([_a-zA-Z0-9\-]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*)\()/,/^(?:([\-]?([_a-zA-Z]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))([_a-zA-Z0-9\-]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*))/,/^(?:([\-_]([0-9a-fA-F])-([0-9a-fA-F])))/,/^(?:@([\-]?([_a-zA-Z]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))([_a-zA-Z0-9\-]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*))/,/^(?:#(([_a-zA-Z0-9\-]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))+))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(E|e|\\0{0,4}(45|65)(\r\n|[ \t\r\n\f])?)(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(E|e|\\0{0,4}(45|65)(\r\n|[ \t\r\n\f])?)(X|x|\\0{0,4}(58|78)(\r\n|[ \t\r\n\f])?|\\[x]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(X|x|\\0{0,4}(58|78)(\r\n|[ \t\r\n\f])?|\\[x]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(C|c|\\0{0,4}(43|63)(\r\n|[ \t\r\n\f])?)(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m])(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(I|i|\\0{0,4}(49|69)(\r\n|[ \t\r\n\f])?|\\[i])(N|n|\\0{0,4}(4e|6e)(\r\n|[ \t\r\n\f])?|\\[n]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(T|t|\\0{0,4}(54|74)(\r\n|[ \t\r\n\f])?|\\[t]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(C|c|\\0{0,4}(43|63)(\r\n|[ \t\r\n\f])?))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(D|d|\\0{0,4}(44|64)(\r\n|[ \t\r\n\f])?)(E|e|\\0{0,4}(45|65)(\r\n|[ \t\r\n\f])?)(G|g|\\0{0,4}(47|67)(\r\n|[ \t\r\n\f])?|\\[g]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(R|r|\\0{0,4}(52|72)(\r\n|[ \t\r\n\f])?|\\[r])(A|a|\\0{0,4}(41|61)(\r\n|[ \t\r\n\f])?)(D|d|\\0{0,4}(44|64)(\r\n|[ \t\r\n\f])?))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(G|g|\\0{0,4}(47|67)(\r\n|[ \t\r\n\f])?|\\[g])(R|r|\\0{0,4}(52|72)(\r\n|[ \t\r\n\f])?|\\[r])(A|a|\\0{0,4}(41|61)(\r\n|[ \t\r\n\f])?)(D|d|\\0{0,4}(44|64)(\r\n|[ \t\r\n\f])?))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m])(S|s|\\0{0,4}(53|73)(\r\n|[ \t\r\n\f])?|\\[s]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(S|s|\\0{0,4}(53|73)(\r\n|[ \t\r\n\f])?|\\[s]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(H|h|\\0{0,4}(48|68)(\r\n|[ \t\r\n\f])?|\\[h])(Z|z|\\0{0,4}(5a|7a)(\r\n|[ \t\r\n\f])?|\\[z]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(K|k|\\0{0,4}(4b|6b)(\r\n|[ \t\r\n\f])?|\\[k])(H|h|\\0{0,4}(48|68)(\r\n|[ \t\r\n\f])?|\\[h])(Z|z|\\0{0,4}(5a|7a)(\r\n|[ \t\r\n\f])?|\\[z]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)([\-]?([_a-zA-Z]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))([_a-zA-Z0-9\-]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)%)/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+))/,/^(?:.)/],
conditions: {"INITIAL":{"rules":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41],"inclusive":true}}
});
return lexer;
})();
parser.lexer = lexer;
function Parser () {
  this.yy = {};
}
Parser.prototype = parser;parser.Parser = Parser;
return new Parser;
})();


if (typeof require !== 'undefined' && typeof exports !== 'undefined') {
exports.parser = parser;
exports.Parser = parser.Parser;
exports.parse = function () { return parser.parse.apply(parser, arguments); };
exports.main = function commonjsMain(args) {
    if (!args[1]) {
        console.log('Usage: '+args[0]+' FILE');
        process.exit(1);
    }
    var source = require('fs').readFileSync(require('path').normalize(args[1]), "utf8");
    return exports.parser.parse(source);
};
if (typeof module !== 'undefined' && require.main === module) {
  exports.main(process.argv.slice(1));
}
}
}).call(this,require('_process'))
},{"_process":11,"fs":9,"path":10}],4:[function(require,module,exports){
(function (process){
/* parser generated by jison 0.4.15 */
/*
  Returns a Parser object of the following structure:

  Parser: {
    yy: {}
  }

  Parser.prototype: {
    yy: {},
    trace: function(),
    symbols_: {associative list: name ==> number},
    terminals_: {associative list: number ==> name},
    productions_: [...],
    performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate, $$, _$),
    table: [...],
    defaultActions: {...},
    parseError: function(str, hash),
    parse: function(input),

    lexer: {
        EOF: 1,
        parseError: function(str, hash),
        setInput: function(input),
        input: function(),
        unput: function(str),
        more: function(),
        less: function(n),
        pastInput: function(),
        upcomingInput: function(),
        showPosition: function(),
        test_match: function(regex_match_array, rule_index),
        next: function(),
        lex: function(),
        begin: function(condition),
        popState: function(),
        _currentRules: function(),
        topState: function(),
        pushState: function(condition),

        options: {
            ranges: boolean           (optional: true ==> token location info will include a .range[] member)
            flex: boolean             (optional: true ==> flex-like lexing behaviour where the rules are tested exhaustively to find the longest match)
            backtrack_lexer: boolean  (optional: true ==> lexer regexes are tested in order and for each matching regex the action code is invoked; the lexer terminates the scan when a token is returned by the action code)
        },

        performAction: function(yy, yy_, $avoiding_name_collisions, YY_START),
        rules: [...],
        conditions: {associative list: name ==> set},
    }
  }


  token location info (@$, _$, etc.): {
    first_line: n,
    last_line: n,
    first_column: n,
    last_column: n,
    range: [start_number, end_number]       (where the numbers are indexes into the input string, regular zero-based)
  }


  the parseError function receives a 'hash' object with these members for lexer and parser errors: {
    text:        (matched text)
    token:       (the produced terminal token, if any)
    line:        (yylineno)
  }
  while parser (grammar) errors will also provide these members, i.e. parser errors deliver a superset of attributes: {
    loc:         (yylloc)
    expected:    (string describing the set of expected tokens)
    recoverable: (boolean: TRUE when the parser has a error recovery rule available for this particular error)
  }
*/
var parser = (function(){
var o=function(k,v,o,l){for(o=o||{},l=k.length;l--;o[k[l]]=v);return o},$V0=[1,14],$V1=[1,15],$V2=[1,26],$V3=[1,16],$V4=[1,11],$V5=[1,17],$V6=[1,18],$V7=[1,19],$V8=[1,20],$V9=[1,21],$Va=[1,22],$Vb=[1,23],$Vc=[1,24],$Vd=[1,25],$Ve=[1,27],$Vf=[1,28],$Vg=[1,29],$Vh=[1,9],$Vi=[1,10],$Vj=[1,8],$Vk=[1,17,18,20,23,27,31,32,33,34,35,36,37,38,39,40,43,44,47,48,50],$Vl=[2,77],$Vm=[1,33],$Vn=[11,17,18],$Vo=[20,23,31,32,33,34,35,36,37,38,39,40,43,44],$Vp=[11,15,17,18,20,22,23,31,32,33,34,35,36,37,38,39,40,42,43,44,45],$Vq=[11,20,22,23,27,31,32,33,34,35,36,37,38,39,40,42,43,44,47,48],$Vr=[1,11,15,17,18,20,22,23,27,31,32,33,34,35,36,37,38,39,40,42,43,44,45,47,48],$Vs=[1,11,15,17,18,20,22,23,27,31,32,33,34,35,36,37,38,39,40,42,43,44,45,47,48,50],$Vt=[15,22,23],$Vu=[1,71],$Vv=[1,68],$Vw=[1,67],$Vx=[2,72],$Vy=[1,69],$Vz=[1,70],$VA=[15,22],$VB=[2,15],$VC=[1,79],$VD=[42,45],$VE=[11,22,27,42,45,47,48],$VF=[1,17,18,20,23,27,31,32,33,34,35,36,37,38,39,40,43,44,47,48],$VG=[11,15],$VH=[15,27],$VI=[15,20,22,23,31,32,33,34,35,36,37,38,39,40,43,44],$VJ=[11,15,22],$VK=[15,22,27];
var parser = {trace: function trace() { },
yy: {},
symbols_: {"error":2,"stylesheet":3,"space_cdata_statements":4,"space_cdata_statement":5,"statement":6,"space_cdata":7,"atrule":8,"ruleset":9,"selector_list":10,"{":11,"space_or_empty":12,"declarations":13,"declaration_list":14,"}":15,"any":16,",":17,"/":18,"property":19,":":20,"value":21,";":22,"IDENT":23,"anys":24,"block":25,"blocks":26,"ATKEYWORD":27,"atkeywords":28,"any_block_atkeyword_semi":29,"semis":30,"NUMBER":31,"PERCENTAGE":32,"DEMINSION":33,"STRING":34,"URI":35,"HASH":36,"UNICODERANGE":37,"INCLUDES":38,"DASHMATCH":39,"FUNCTION":40,"any_unuseds":41,")":42,"(":43,"[":44,"]":45,"unused":46,"CDO":47,"CDC":48,"unuseds":49,"S":50,"at_least_one_space":51,"$accept":0,"$end":1},
terminals_: {2:"error",11:"{",15:"}",17:",",18:"/",20:":",22:";",23:"IDENT",27:"ATKEYWORD",31:"NUMBER",32:"PERCENTAGE",33:"DEMINSION",34:"STRING",35:"URI",36:"HASH",37:"UNICODERANGE",38:"INCLUDES",39:"DASHMATCH",40:"FUNCTION",42:")",43:"(",44:"[",45:"]",47:"CDO",48:"CDC",50:"S"},
productions_: [0,[3,1],[4,1],[4,2],[5,1],[5,1],[6,1],[6,1],[9,7],[10,1],[10,3],[10,3],[10,4],[10,4],[13,5],[13,0],[14,3],[14,4],[14,0],[19,1],[21,1],[21,2],[21,1],[21,2],[21,2],[21,3],[8,4],[8,5],[25,5],[26,1],[26,2],[26,0],[29,1],[29,1],[29,1],[29,1],[29,0],[16,2],[16,2],[16,2],[16,2],[16,2],[16,2],[16,2],[16,2],[16,2],[16,2],[16,2],[16,5],[16,5],[16,5],[24,1],[24,2],[24,0],[46,1],[46,2],[46,2],[46,2],[46,2],[49,1],[49,2],[49,0],[28,2],[28,3],[28,0],[30,2],[30,3],[30,0],[41,1],[41,1],[41,1],[41,1],[41,0],[7,1],[7,1],[7,1],[12,1],[12,0],[51,1],[51,2]],
performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate /* action[1] */, $$ /* vstack */, _$ /* lstack */) {
/* this == yyval */

var $0 = $$.length - 1;
switch (yystate) {
case 1:

      this.$ = [];
      if ($$[$0] !== null) this.$ = $$[$0];
      return this.$;
    
break;
case 2:

      this.$ = [];
      this.$.push($$[$0]);
    
break;
case 3:

      this.$ = [];
      if ($$[$0-1] !== null && $$[$0] !== null) {
        var s = this.$; 
        $$[$0-1].forEach(function(d) { s.push(d); });
        s.push($$[$0]);
      } else if ($$[$0-1] !== null && $$[$0] === null) {
        this.$ = $$[$0-1];
      } 
    
break;
case 4: case 6: case 7: case 9: case 10: case 11: case 19: case 32: case 33: case 34: case 35: case 54: case 69: case 71: case 76:
this.$ = $$[$0];
break;
case 5: case 15: case 18: case 31: case 36: case 53: case 57: case 58: case 61: case 64: case 67: case 72: case 73: case 74: case 75:
this.$ = null;
break;
case 8:

      this.$ = {};
      this.$.selector = $$[$0-6];
      this.$.declaration = [];
      var s = this.$;
      $$[$0-3] !== null? s.declaration.push($$[$0-3]) : '';
      $$[$0-2] !== null? $$[$0-2].forEach(function(d) { s.declaration.push(d); }) : ''
    
break;
case 12:
this.$ = $$[$0-3] + "," + $$[$0];
break;
case 13:
this.$ = $$[$0-3] + "/" + $$[$0];
break;
case 14:

      this.$ = {};
      if ($$[$0-4] !== null) this.$.key = $$[$0-4];
      if ($$[$0] !== null) this.$.value = $$[$0];
    
break;
case 16: case 20: case 22: case 29: case 51: case 59:

      this.$ = [];
      if ($$[$0] !== null) this.$.push($$[$0]);
    
break;
case 17:

      this.$ = [];
      this.$ = $$[$0-3];
      if ($$[$0] !== null) this.$.push($$[$0]);
    
break;
case 21: case 23: case 30: case 52: case 60:

      this.$ = [];
      var r = this.$;
      $$[$0-1] !== null? $$[$0-1].forEach(function(e) { r.push(e); }) : '';
      if ($$[$0] !== null) this.$.push($$[$0]);
    
break;
case 24: case 62: case 65:

      this.$ = [];
      if ($$[$0-1] !== null) this.$.push($$[$0-1]);
    
break;
case 25: case 63: case 66:

      this.$ = [];
      var r = this.$;
      $$[$0-2] !== null? $$[$0-2].forEach(function(e) { r.push(e); }) : '';
      if ($$[$0-1] !== null) this.$.push($$[$0-1]);
    
break;
case 26:

      this.$ = {};
      this.$[$$[$0-3]] = [];
      var r = this.$[$$[$0-3]];
      $$[$0-1] !== null? $$[$0-1].forEach(function(e) { r.push(e); }) : '';
      this.$[$$[$0-3]].push($$[$0]);
    
break;
case 27:

      this.$ = {};
      this.$[$$[$0-4]] = [];
      var r = this.$[$$[$0-4]];
      $$[$0-2] !== null? $$[$0-2].forEach(function(e) { r.push(e); }) : '';
    
break;
case 28:
this.$ = $$[$0-2];
break;
case 37: case 38: case 39: case 40: case 41: case 42: case 43: case 44: case 45: case 46: case 47: case 55: case 56:
this.$ = $$[$0-1];
break;
case 48: case 49: case 50:
this.$ = $$[$0-4] + $$[$0-2] + $$[$0-1];
break;
case 68: case 70:

      this.$ = [];
      $$[$0] !== null? this.$.push($$[$0]) : '';
    
break;
case 77:
this.$ = "";
break;
case 78: case 79:
this.$ = " ";
break;
}
},
table: [{3:1,4:2,5:3,6:4,7:5,8:6,9:7,10:12,16:13,17:$V0,18:$V1,20:$V2,23:$V3,27:$V4,31:$V5,32:$V6,33:$V7,34:$V8,35:$V9,36:$Va,37:$Vb,38:$Vc,39:$Vd,40:$Ve,43:$Vf,44:$Vg,47:$Vh,48:$Vi,50:$Vj},{1:[3]},{1:[2,1],5:30,6:4,7:5,8:6,9:7,10:12,16:13,17:$V0,18:$V1,20:$V2,23:$V3,27:$V4,31:$V5,32:$V6,33:$V7,34:$V8,35:$V9,36:$Va,37:$Vb,38:$Vc,39:$Vd,40:$Ve,43:$Vf,44:$Vg,47:$Vh,48:$Vi,50:$Vj},o($Vk,[2,2]),o($Vk,[2,4]),o($Vk,[2,5]),o($Vk,[2,6]),o($Vk,[2,7]),o($Vk,[2,73]),o($Vk,[2,74]),o($Vk,[2,75]),o([11,20,22,23,31,32,33,34,35,36,37,38,39,40,43,44],$Vl,{12:31,51:32,50:$Vm}),{11:[1,34],17:[1,35],18:[1,36]},o($Vn,[2,9]),o($Vo,$Vl,{51:32,12:37,50:$Vm}),o($Vo,$Vl,{51:32,12:38,50:$Vm}),o($Vp,$Vl,{51:32,12:39,50:$Vm}),o($Vp,$Vl,{51:32,12:40,50:$Vm}),o($Vp,$Vl,{51:32,12:41,50:$Vm}),o($Vp,$Vl,{51:32,12:42,50:$Vm}),o($Vp,$Vl,{51:32,12:43,50:$Vm}),o($Vp,$Vl,{51:32,12:44,50:$Vm}),o($Vp,$Vl,{51:32,12:45,50:$Vm}),o($Vp,$Vl,{51:32,12:46,50:$Vm}),o($Vp,$Vl,{51:32,12:47,50:$Vm}),o($Vp,$Vl,{51:32,12:48,50:$Vm}),o($Vp,$Vl,{51:32,12:49,50:$Vm}),o($Vq,$Vl,{51:32,12:50,50:$Vm}),o($Vq,$Vl,{51:32,12:51,50:$Vm}),o([11,20,22,23,27,31,32,33,34,35,36,37,38,39,40,43,44,45,47,48],$Vl,{51:32,12:52,50:$Vm}),o($Vk,[2,3]),o([11,22],[2,53],{24:53,16:54,20:$V2,23:$V3,31:$V5,32:$V6,33:$V7,34:$V8,35:$V9,36:$Va,37:$Vb,38:$Vc,39:$Vd,40:$Ve,43:$Vf,44:$Vg}),o($Vr,[2,76],{50:[1,55]}),o($Vs,[2,78]),o($Vt,$Vl,{51:32,12:56,50:$Vm}),o($Vo,$Vl,{51:32,12:57,50:$Vm}),o($Vo,$Vl,{51:32,12:58,50:$Vm}),{16:59,20:$V2,23:$V3,31:$V5,32:$V6,33:$V7,34:$V8,35:$V9,36:$Va,37:$Vb,38:$Vc,39:$Vd,40:$Ve,43:$Vf,44:$Vg},{16:60,20:$V2,23:$V3,31:$V5,32:$V6,33:$V7,34:$V8,35:$V9,36:$Va,37:$Vb,38:$Vc,39:$Vd,40:$Ve,43:$Vf,44:$Vg},o($Vp,[2,37]),o($Vp,[2,38]),o($Vp,[2,39]),o($Vp,[2,40]),o($Vp,[2,41]),o($Vp,[2,42]),o($Vp,[2,43]),o($Vp,[2,44]),o($Vp,[2,45]),o($Vp,[2,46]),o($Vp,[2,47]),{11:$Vu,16:62,20:$V2,22:$Vv,23:$V3,24:63,25:66,27:$Vw,31:$V5,32:$V6,33:$V7,34:$V8,35:$V9,36:$Va,37:$Vb,38:$Vc,39:$Vd,40:$Ve,41:61,42:$Vx,43:$Vf,44:$Vg,46:64,47:$Vy,48:$Vz,49:65},{11:$Vu,16:62,20:$V2,22:$Vv,23:$V3,24:63,25:66,27:$Vw,31:$V5,32:$V6,33:$V7,34:$V8,35:$V9,36:$Va,37:$Vb,38:$Vc,39:$Vd,40:$Ve,41:72,42:$Vx,43:$Vf,44:$Vg,46:64,47:$Vy,48:$Vz,49:65},{11:$Vu,16:62,20:$V2,22:$Vv,23:$V3,24:63,25:66,27:$Vw,31:$V5,32:$V6,33:$V7,34:$V8,35:$V9,36:$Va,37:$Vb,38:$Vc,39:$Vd,40:$Ve,41:73,43:$Vf,44:$Vg,45:$Vx,46:64,47:$Vy,48:$Vz,49:65},{11:$Vu,16:76,20:$V2,22:[1,75],23:$V3,25:74,31:$V5,32:$V6,33:$V7,34:$V8,35:$V9,36:$Va,37:$Vb,38:$Vc,39:$Vd,40:$Ve,43:$Vf,44:$Vg},o([11,15,20,22,23,31,32,33,34,35,36,37,38,39,40,43,44],[2,51]),o($Vs,[2,79]),o($VA,$VB,{13:77,19:78,23:$VC}),{16:80,20:$V2,23:$V3,31:$V5,32:$V6,33:$V7,34:$V8,35:$V9,36:$Va,37:$Vb,38:$Vc,39:$Vd,40:$Ve,43:$Vf,44:$Vg},{16:81,20:$V2,23:$V3,31:$V5,32:$V6,33:$V7,34:$V8,35:$V9,36:$Va,37:$Vb,38:$Vc,39:$Vd,40:$Ve,43:$Vf,44:$Vg},o($Vn,[2,10]),o($Vn,[2,11]),{42:[1,82]},o([20,23,31,32,33,34,35,36,37,38,39,40,42,43,44,45],[2,68]),o($VD,[2,69],{16:76,20:$V2,23:$V3,31:$V5,32:$V6,33:$V7,34:$V8,35:$V9,36:$Va,37:$Vb,38:$Vc,39:$Vd,40:$Ve,43:$Vf,44:$Vg}),o($VE,[2,70]),o($VD,[2,71],{25:66,46:83,11:$Vu,22:$Vv,27:$Vw,47:$Vy,48:$Vz}),o($VE,[2,54]),o($VE,$Vl,{51:32,12:84,50:$Vm}),o($VE,$Vl,{51:32,12:85,50:$Vm}),o($VE,$Vl,{51:32,12:86,50:$Vm}),o($VE,$Vl,{51:32,12:87,50:$Vm}),o([11,15,20,22,23,27,31,32,33,34,35,36,37,38,39,40,43,44],$Vl,{51:32,12:88,50:$Vm}),{42:[1,89]},{45:[1,90]},o($Vk,[2,26]),o($VF,$Vl,{51:32,12:91,50:$Vm}),o([11,15,20,22,23,31,32,33,34,35,36,37,38,39,40,42,43,44,45],[2,52]),{14:92,15:[2,18],22:[1,93]},{12:94,20:$Vl,50:$Vm,51:32},o([20,50],[2,19]),o($Vn,[2,12]),o($Vn,[2,13]),o($Vp,$Vl,{51:32,12:95,50:$Vm}),o($VE,[2,60]),o($VE,[2,55]),o($VE,[2,56]),o($VE,[2,57]),o($VE,[2,58]),{11:$Vu,15:[2,36],16:54,20:$V2,22:[1,103],23:$V3,24:97,25:101,26:98,27:[1,102],28:99,29:96,30:100,31:$V5,32:$V6,33:$V7,34:$V8,35:$V9,36:$Va,37:$Vb,38:$Vc,39:$Vd,40:$Ve,43:$Vf,44:$Vg},o($Vp,$Vl,{51:32,12:104,50:$Vm}),o($Vp,$Vl,{51:32,12:105,50:$Vm}),o($Vk,[2,27]),{15:[1,106],22:[1,107]},o($Vt,$Vl,{51:32,12:108,50:$Vm}),{20:[1,109]},o($Vp,[2,48]),{15:[1,110]},{15:[2,32],16:76,20:$V2,23:$V3,31:$V5,32:$V6,33:$V7,34:$V8,35:$V9,36:$Va,37:$Vb,38:$Vc,39:$Vd,40:$Ve,43:$Vf,44:$Vg},{11:$Vu,15:[2,33],25:111},{15:[2,34],27:[1,112]},{15:[2,35],22:[1,113]},o($VG,[2,29]),o($VH,$Vl,{51:32,12:114,50:$Vm}),o($VA,$Vl,{51:32,12:115,50:$Vm}),o($Vp,[2,49]),o($Vp,[2,50]),o($VF,$Vl,{51:32,12:116,50:$Vm}),o($Vt,$Vl,{51:32,12:117,50:$Vm}),o($VA,$VB,{19:78,13:118,23:$VC}),o([11,20,23,27,31,32,33,34,35,36,37,38,39,40,43,44],$Vl,{51:32,12:119,50:$Vm}),o($Vr,$Vl,{51:32,12:120,50:$Vm}),o($VG,[2,30]),o($VH,$Vl,{51:32,12:121,50:$Vm}),o($VA,$Vl,{51:32,12:122,50:$Vm}),o($VH,[2,62]),o($VA,[2,65]),o($Vk,[2,8]),o($VA,$VB,{19:78,13:123,23:$VC}),o($VA,[2,16]),{11:$Vu,16:125,20:$V2,21:124,23:$V3,24:126,25:127,26:128,27:[1,129],28:130,31:$V5,32:$V6,33:$V7,34:$V8,35:$V9,36:$Va,37:$Vb,38:$Vc,39:$Vd,40:$Ve,43:$Vf,44:$Vg},o($Vs,[2,28]),o($VH,[2,63]),o($VA,[2,66]),o($VA,[2,17]),o($VA,[2,14]),o($VI,[2,20]),{16:131,20:$V2,23:$V3,31:$V5,32:$V6,33:$V7,34:$V8,35:$V9,36:$Va,37:$Vb,38:$Vc,39:$Vd,40:$Ve,43:$Vf,44:$Vg},o($VJ,[2,22]),{11:$Vu,25:132},o($VK,$Vl,{51:32,12:133,50:$Vm}),{27:[1,134]},o($VI,[2,21]),o($VJ,[2,23]),o($VK,[2,24]),o($VK,$Vl,{51:32,12:135,50:$Vm}),o($VK,[2,25])],
defaultActions: {},
parseError: function parseError(str, hash) {
    if (hash.recoverable) {
        this.trace(str);
    } else {
        throw new Error(str);
    }
},
parse: function parse(input) {
    var self = this, stack = [0], tstack = [], vstack = [null], lstack = [], table = this.table, yytext = '', yylineno = 0, yyleng = 0, recovering = 0, TERROR = 2, EOF = 1;
    var args = lstack.slice.call(arguments, 1);
    var lexer = Object.create(this.lexer);
    var sharedState = { yy: {} };
    for (var k in this.yy) {
        if (Object.prototype.hasOwnProperty.call(this.yy, k)) {
            sharedState.yy[k] = this.yy[k];
        }
    }
    lexer.setInput(input, sharedState.yy);
    sharedState.yy.lexer = lexer;
    sharedState.yy.parser = this;
    if (typeof lexer.yylloc == 'undefined') {
        lexer.yylloc = {};
    }
    var yyloc = lexer.yylloc;
    lstack.push(yyloc);
    var ranges = lexer.options && lexer.options.ranges;
    if (typeof sharedState.yy.parseError === 'function') {
        this.parseError = sharedState.yy.parseError;
    } else {
        this.parseError = Object.getPrototypeOf(this).parseError;
    }
    function popStack(n) {
        stack.length = stack.length - 2 * n;
        vstack.length = vstack.length - n;
        lstack.length = lstack.length - n;
    }
    _token_stack:
        function lex() {
            var token;
            token = lexer.lex() || EOF;
            if (typeof token !== 'number') {
                token = self.symbols_[token] || token;
            }
            return token;
        }
    var symbol, preErrorSymbol, state, action, a, r, yyval = {}, p, len, newState, expected;
    while (true) {
        state = stack[stack.length - 1];
        if (this.defaultActions[state]) {
            action = this.defaultActions[state];
        } else {
            if (symbol === null || typeof symbol == 'undefined') {
                symbol = lex();
            }
            action = table[state] && table[state][symbol];
        }
                    if (typeof action === 'undefined' || !action.length || !action[0]) {
                var errStr = '';
                expected = [];
                for (p in table[state]) {
                    if (this.terminals_[p] && p > TERROR) {
                        expected.push('\'' + this.terminals_[p] + '\'');
                    }
                }
                if (lexer.showPosition) {
                    errStr = 'Parse error on line ' + (yylineno + 1) + ':\n' + lexer.showPosition() + '\nExpecting ' + expected.join(', ') + ', got \'' + (this.terminals_[symbol] || symbol) + '\'';
                } else {
                    errStr = 'Parse error on line ' + (yylineno + 1) + ': Unexpected ' + (symbol == EOF ? 'end of input' : '\'' + (this.terminals_[symbol] || symbol) + '\'');
                }
                this.parseError(errStr, {
                    text: lexer.match,
                    token: this.terminals_[symbol] || symbol,
                    line: lexer.yylineno,
                    loc: yyloc,
                    expected: expected
                });
            }
        if (action[0] instanceof Array && action.length > 1) {
            throw new Error('Parse Error: multiple actions possible at state: ' + state + ', token: ' + symbol);
        }
        switch (action[0]) {
        case 1:
            stack.push(symbol);
            vstack.push(lexer.yytext);
            lstack.push(lexer.yylloc);
            stack.push(action[1]);
            symbol = null;
            if (!preErrorSymbol) {
                yyleng = lexer.yyleng;
                yytext = lexer.yytext;
                yylineno = lexer.yylineno;
                yyloc = lexer.yylloc;
                if (recovering > 0) {
                    recovering--;
                }
            } else {
                symbol = preErrorSymbol;
                preErrorSymbol = null;
            }
            break;
        case 2:
            len = this.productions_[action[1]][1];
            yyval.$ = vstack[vstack.length - len];
            yyval._$ = {
                first_line: lstack[lstack.length - (len || 1)].first_line,
                last_line: lstack[lstack.length - 1].last_line,
                first_column: lstack[lstack.length - (len || 1)].first_column,
                last_column: lstack[lstack.length - 1].last_column
            };
            if (ranges) {
                yyval._$.range = [
                    lstack[lstack.length - (len || 1)].range[0],
                    lstack[lstack.length - 1].range[1]
                ];
            }
            r = this.performAction.apply(yyval, [
                yytext,
                yyleng,
                yylineno,
                sharedState.yy,
                action[1],
                vstack,
                lstack
            ].concat(args));
            if (typeof r !== 'undefined') {
                return r;
            }
            if (len) {
                stack = stack.slice(0, -1 * len * 2);
                vstack = vstack.slice(0, -1 * len);
                lstack = lstack.slice(0, -1 * len);
            }
            stack.push(this.productions_[action[1]][0]);
            vstack.push(yyval.$);
            lstack.push(yyval._$);
            newState = table[stack[stack.length - 2]][stack[stack.length - 1]];
            stack.push(newState);
            break;
        case 3:
            return true;
        }
    }
    return true;
}};
/* generated by jison-lex 0.3.4 */
var lexer = (function(){
var lexer = ({

EOF:1,

parseError:function parseError(str, hash) {
        if (this.yy.parser) {
            this.yy.parser.parseError(str, hash);
        } else {
            throw new Error(str);
        }
    },

// resets the lexer, sets new input
setInput:function (input, yy) {
        this.yy = yy || this.yy || {};
        this._input = input;
        this._more = this._backtrack = this.done = false;
        this.yylineno = this.yyleng = 0;
        this.yytext = this.matched = this.match = '';
        this.conditionStack = ['INITIAL'];
        this.yylloc = {
            first_line: 1,
            first_column: 0,
            last_line: 1,
            last_column: 0
        };
        if (this.options.ranges) {
            this.yylloc.range = [0,0];
        }
        this.offset = 0;
        return this;
    },

// consumes and returns one char from the input
input:function () {
        var ch = this._input[0];
        this.yytext += ch;
        this.yyleng++;
        this.offset++;
        this.match += ch;
        this.matched += ch;
        var lines = ch.match(/(?:\r\n?|\n).*/g);
        if (lines) {
            this.yylineno++;
            this.yylloc.last_line++;
        } else {
            this.yylloc.last_column++;
        }
        if (this.options.ranges) {
            this.yylloc.range[1]++;
        }

        this._input = this._input.slice(1);
        return ch;
    },

// unshifts one char (or a string) into the input
unput:function (ch) {
        var len = ch.length;
        var lines = ch.split(/(?:\r\n?|\n)/g);

        this._input = ch + this._input;
        this.yytext = this.yytext.substr(0, this.yytext.length - len);
        //this.yyleng -= len;
        this.offset -= len;
        var oldLines = this.match.split(/(?:\r\n?|\n)/g);
        this.match = this.match.substr(0, this.match.length - 1);
        this.matched = this.matched.substr(0, this.matched.length - 1);

        if (lines.length - 1) {
            this.yylineno -= lines.length - 1;
        }
        var r = this.yylloc.range;

        this.yylloc = {
            first_line: this.yylloc.first_line,
            last_line: this.yylineno + 1,
            first_column: this.yylloc.first_column,
            last_column: lines ?
                (lines.length === oldLines.length ? this.yylloc.first_column : 0)
                 + oldLines[oldLines.length - lines.length].length - lines[0].length :
              this.yylloc.first_column - len
        };

        if (this.options.ranges) {
            this.yylloc.range = [r[0], r[0] + this.yyleng - len];
        }
        this.yyleng = this.yytext.length;
        return this;
    },

// When called from action, caches matched text and appends it on next action
more:function () {
        this._more = true;
        return this;
    },

// When called from action, signals the lexer that this rule fails to match the input, so the next matching rule (regex) should be tested instead.
reject:function () {
        if (this.options.backtrack_lexer) {
            this._backtrack = true;
        } else {
            return this.parseError('Lexical error on line ' + (this.yylineno + 1) + '. You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).\n' + this.showPosition(), {
                text: "",
                token: null,
                line: this.yylineno
            });

        }
        return this;
    },

// retain first n characters of the match
less:function (n) {
        this.unput(this.match.slice(n));
    },

// displays already matched input, i.e. for error messages
pastInput:function () {
        var past = this.matched.substr(0, this.matched.length - this.match.length);
        return (past.length > 20 ? '...':'') + past.substr(-20).replace(/\n/g, "");
    },

// displays upcoming input, i.e. for error messages
upcomingInput:function () {
        var next = this.match;
        if (next.length < 20) {
            next += this._input.substr(0, 20-next.length);
        }
        return (next.substr(0,20) + (next.length > 20 ? '...' : '')).replace(/\n/g, "");
    },

// displays the character position where the lexing error occurred, i.e. for error messages
showPosition:function () {
        var pre = this.pastInput();
        var c = new Array(pre.length + 1).join("-");
        return pre + this.upcomingInput() + "\n" + c + "^";
    },

// test the lexed token: return FALSE when not a match, otherwise return token
test_match:function (match, indexed_rule) {
        var token,
            lines,
            backup;

        if (this.options.backtrack_lexer) {
            // save context
            backup = {
                yylineno: this.yylineno,
                yylloc: {
                    first_line: this.yylloc.first_line,
                    last_line: this.last_line,
                    first_column: this.yylloc.first_column,
                    last_column: this.yylloc.last_column
                },
                yytext: this.yytext,
                match: this.match,
                matches: this.matches,
                matched: this.matched,
                yyleng: this.yyleng,
                offset: this.offset,
                _more: this._more,
                _input: this._input,
                yy: this.yy,
                conditionStack: this.conditionStack.slice(0),
                done: this.done
            };
            if (this.options.ranges) {
                backup.yylloc.range = this.yylloc.range.slice(0);
            }
        }

        lines = match[0].match(/(?:\r\n?|\n).*/g);
        if (lines) {
            this.yylineno += lines.length;
        }
        this.yylloc = {
            first_line: this.yylloc.last_line,
            last_line: this.yylineno + 1,
            first_column: this.yylloc.last_column,
            last_column: lines ?
                         lines[lines.length - 1].length - lines[lines.length - 1].match(/\r?\n?/)[0].length :
                         this.yylloc.last_column + match[0].length
        };
        this.yytext += match[0];
        this.match += match[0];
        this.matches = match;
        this.yyleng = this.yytext.length;
        if (this.options.ranges) {
            this.yylloc.range = [this.offset, this.offset += this.yyleng];
        }
        this._more = false;
        this._backtrack = false;
        this._input = this._input.slice(match[0].length);
        this.matched += match[0];
        token = this.performAction.call(this, this.yy, this, indexed_rule, this.conditionStack[this.conditionStack.length - 1]);
        if (this.done && this._input) {
            this.done = false;
        }
        if (token) {
            return token;
        } else if (this._backtrack) {
            // recover context
            for (var k in backup) {
                this[k] = backup[k];
            }
            return false; // rule action called reject() implying the next rule should be tested instead.
        }
        return false;
    },

// return next match in input
next:function () {
        if (this.done) {
            return this.EOF;
        }
        if (!this._input) {
            this.done = true;
        }

        var token,
            match,
            tempMatch,
            index;
        if (!this._more) {
            this.yytext = '';
            this.match = '';
        }
        var rules = this._currentRules();
        for (var i = 0; i < rules.length; i++) {
            tempMatch = this._input.match(this.rules[rules[i]]);
            if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
                match = tempMatch;
                index = i;
                if (this.options.backtrack_lexer) {
                    token = this.test_match(tempMatch, rules[i]);
                    if (token !== false) {
                        return token;
                    } else if (this._backtrack) {
                        match = false;
                        continue; // rule action called reject() implying a rule MISmatch.
                    } else {
                        // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
                        return false;
                    }
                } else if (!this.options.flex) {
                    break;
                }
            }
        }
        if (match) {
            token = this.test_match(match, rules[index]);
            if (token !== false) {
                return token;
            }
            // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
            return false;
        }
        if (this._input === "") {
            return this.EOF;
        } else {
            return this.parseError('Lexical error on line ' + (this.yylineno + 1) + '. Unrecognized text.\n' + this.showPosition(), {
                text: "",
                token: null,
                line: this.yylineno
            });
        }
    },

// return next match that has a token
lex:function lex() {
        var r = this.next();
        if (r) {
            return r;
        } else {
            return this.lex();
        }
    },

// activates a new lexer condition state (pushes the new lexer condition state onto the condition stack)
begin:function begin(condition) {
        this.conditionStack.push(condition);
    },

// pop the previously active lexer condition state off the condition stack
popState:function popState() {
        var n = this.conditionStack.length - 1;
        if (n > 0) {
            return this.conditionStack.pop();
        } else {
            return this.conditionStack[0];
        }
    },

// produce the lexer rule set which is active for the currently active lexer condition state
_currentRules:function _currentRules() {
        if (this.conditionStack.length && this.conditionStack[this.conditionStack.length - 1]) {
            return this.conditions[this.conditionStack[this.conditionStack.length - 1]].rules;
        } else {
            return this.conditions["INITIAL"].rules;
        }
    },

// return the currently active lexer condition state; when an index argument is provided it produces the N-th previous condition state, if available
topState:function topState(n) {
        n = this.conditionStack.length - 1 - Math.abs(n || 0);
        if (n >= 0) {
            return this.conditionStack[n];
        } else {
            return "INITIAL";
        }
    },

// alias for begin(condition)
pushState:function pushState(condition) {
        this.begin(condition);
    },

// return the number of states currently on the stack
stateStackSize:function stateStackSize() {
        return this.conditionStack.length;
    },
options: {},
performAction: function anonymous(yy,yy_,$avoiding_name_collisions,YY_START) {
var YYSTATE=YY_START;
switch($avoiding_name_collisions) {
case 0:return 50;
break;
case 1:
break;
case 2:
break;
case 3:return 47;
break;
case 4:return 48;
break;
case 5:return 38;
break;
case 6:return 39;
break;
case 7:return 34;
break;
case 8:return 'BAD_STRING';
break;
case 9:return 35;
break;
case 10:return 35;
break;
case 11:return 'BAD_URI';
break;
case 12:return 'IMPORTANT_SYM';
break;
case 13:return 37;
break;
case 14:return 40;
break;
case 15:return 23;
break;
case 16:return 'VENDOR';
break;
case 17:return 27;
break;
case 18:return 36;
break;
case 19:return 'EMS';
break;
case 20:return 'EXS';
break;
case 21:return 'LENGTH';
break;
case 22:return 'LENGTH';
break;
case 23:return 'LENGTH';
break;
case 24:return 'LENGTH';
break;
case 25:return 'LENGTH';
break;
case 26:return 'LENGTH';
break;
case 27:return 'ANGLE';
break;
case 28:return 'ANGLE';
break;
case 29:return 'ANGLE';
break;
case 30:return 'TIME';
break;
case 31:return 'TIME';
break;
case 32:return 'FREQ';
break;
case 33:return 'FREQ';
break;
case 34:return 'DIMENSION';
break;
case 35:return 32;
break;
case 36:return 31;
break;
case 37:return yy_.yytext; /* 'DELIM'; */
break;
}
},
rules: [/^(?:([ \t\r\n\f]+))/,/^(?:\/\*[^*]*\*+([^/*][^*]*\*+)*\/)/,/^(?:((\/\*[^*]*\*+([^/*][^*]*\*+)*)|(\/\*[^*]*(\*+[^/*][^*]*)*)))/,/^(?:<!--)/,/^(?:-->)/,/^(?:~=)/,/^(?:\|=)/,/^(?:(("([^\n\r\f\\"]|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*")|('([^\n\r\f\\']|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*')))/,/^(?:(("([^\n\r\f\\"]|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*\\?)|('([^\n\r\f\\']|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*\\?)))/,/^(?:url\((([ \t\r\n\f]+)?)(("([^\n\r\f\\"]|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*")|('([^\n\r\f\\']|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*'))(([ \t\r\n\f]+)?)\))/,/^(?:url\((([ \t\r\n\f]+)?)(([!#$%&*-~]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*)(([ \t\r\n\f]+)?)\))/,/^(?:((url\((([ \t\r\n\f]+)?)([!#$%&*-\[\]-~]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*(([ \t\r\n\f]+)?))|(url\((([ \t\r\n\f]+)?)(("([^\n\r\f\\"]|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*")|('([^\n\r\f\\']|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*'))(([ \t\r\n\f]+)?))|(url\((([ \t\r\n\f]+)?)(("([^\n\r\f\\"]|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*\\?)|('([^\n\r\f\\']|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*\\?)))))/,/^(?:!((([ \t\r\n\f]+)?)|(\/\*[^*]*\*+([^/*][^*]*\*+)*\/))*(I|i|\\0{0,4}(49|69)(\r\n|[ \t\r\n\f])?|\\[i])(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m])(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(O|o|\\0{0,4}(4f|6f)(\r\n|[ \t\r\n\f])?|\\[o])(R|r|\\0{0,4}(52|72)(\r\n|[ \t\r\n\f])?|\\[r])(T|t|\\0{0,4}(54|74)(\r\n|[ \t\r\n\f])?|\\[t])(A|a|\\0{0,4}(41|61)(\r\n|[ \t\r\n\f])?)(N|n|\\0{0,4}(4e|6e)(\r\n|[ \t\r\n\f])?|\\[n])(T|t|\\0{0,4}(54|74)(\r\n|[ \t\r\n\f])?|\\[t]))/,/^(?:(U|u|\\0{0,4}(55|75)(\r\n|[ \t\r\n\f])?|\\[u])\+([0-9a-fA-F?]{1,6}(-[0-9a-fA-F]{1,6})?))/,/^(?:([\-]?([_a-zA-Z]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))([_a-zA-Z0-9\-]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*)\()/,/^(?:([\-]?([_a-zA-Z]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))([_a-zA-Z0-9\-]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*))/,/^(?:([\-_]([0-9a-fA-F])-([0-9a-fA-F])))/,/^(?:@([\-]?([_a-zA-Z]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))([_a-zA-Z0-9\-]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*))/,/^(?:#(([_a-zA-Z0-9\-]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))+))/,/^(?:([0-9]+|[0-9]*\.[0-9]+)(E|e|\\0{0,4}(45|65)(\r\n|[ \t\r\n\f])?)(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m]))/,/^(?:([0-9]+|[0-9]*\.[0-9]+)(E|e|\\0{0,4}(45|65)(\r\n|[ \t\r\n\f])?)(X|x|\\0{0,4}(58|78)(\r\n|[ \t\r\n\f])?|\\[x]))/,/^(?:([0-9]+|[0-9]*\.[0-9]+)(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(X|x|\\0{0,4}(58|78)(\r\n|[ \t\r\n\f])?|\\[x]))/,/^(?:([0-9]+|[0-9]*\.[0-9]+)(C|c|\\0{0,4}(43|63)(\r\n|[ \t\r\n\f])?)(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m]))/,/^(?:([0-9]+|[0-9]*\.[0-9]+)(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m])(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m]))/,/^(?:([0-9]+|[0-9]*\.[0-9]+)(I|i|\\0{0,4}(49|69)(\r\n|[ \t\r\n\f])?|\\[i])(N|n|\\0{0,4}(4e|6e)(\r\n|[ \t\r\n\f])?|\\[n]))/,/^(?:([0-9]+|[0-9]*\.[0-9]+)(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(T|t|\\0{0,4}(54|74)(\r\n|[ \t\r\n\f])?|\\[t]))/,/^(?:([0-9]+|[0-9]*\.[0-9]+)(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(C|c|\\0{0,4}(43|63)(\r\n|[ \t\r\n\f])?))/,/^(?:([0-9]+|[0-9]*\.[0-9]+)(D|d|\\0{0,4}(44|64)(\r\n|[ \t\r\n\f])?)(E|e|\\0{0,4}(45|65)(\r\n|[ \t\r\n\f])?)(G|g|\\0{0,4}(47|67)(\r\n|[ \t\r\n\f])?|\\[g]))/,/^(?:([0-9]+|[0-9]*\.[0-9]+)(R|r|\\0{0,4}(52|72)(\r\n|[ \t\r\n\f])?|\\[r])(A|a|\\0{0,4}(41|61)(\r\n|[ \t\r\n\f])?)(D|d|\\0{0,4}(44|64)(\r\n|[ \t\r\n\f])?))/,/^(?:([0-9]+|[0-9]*\.[0-9]+)(G|g|\\0{0,4}(47|67)(\r\n|[ \t\r\n\f])?|\\[g])(R|r|\\0{0,4}(52|72)(\r\n|[ \t\r\n\f])?|\\[r])(A|a|\\0{0,4}(41|61)(\r\n|[ \t\r\n\f])?)(D|d|\\0{0,4}(44|64)(\r\n|[ \t\r\n\f])?))/,/^(?:([0-9]+|[0-9]*\.[0-9]+)(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m])(S|s|\\0{0,4}(53|73)(\r\n|[ \t\r\n\f])?|\\[s]))/,/^(?:([0-9]+|[0-9]*\.[0-9]+)(S|s|\\0{0,4}(53|73)(\r\n|[ \t\r\n\f])?|\\[s]))/,/^(?:([0-9]+|[0-9]*\.[0-9]+)(H|h|\\0{0,4}(48|68)(\r\n|[ \t\r\n\f])?|\\[h])(Z|z|\\0{0,4}(5a|7a)(\r\n|[ \t\r\n\f])?|\\[z]))/,/^(?:([0-9]+|[0-9]*\.[0-9]+)(K|k|\\0{0,4}(4b|6b)(\r\n|[ \t\r\n\f])?|\\[k])(H|h|\\0{0,4}(48|68)(\r\n|[ \t\r\n\f])?|\\[h])(Z|z|\\0{0,4}(5a|7a)(\r\n|[ \t\r\n\f])?|\\[z]))/,/^(?:([0-9]+|[0-9]*\.[0-9]+)([\-]?([_a-zA-Z]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))([_a-zA-Z0-9\-]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*))/,/^(?:([0-9]+|[0-9]*\.[0-9]+)%)/,/^(?:([0-9]+|[0-9]*\.[0-9]+))/,/^(?:.)/],
conditions: {"INITIAL":{"rules":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37],"inclusive":true}}
});
return lexer;
})();
parser.lexer = lexer;
function Parser () {
  this.yy = {};
}
Parser.prototype = parser;parser.Parser = Parser;
return new Parser;
})();


if (typeof require !== 'undefined' && typeof exports !== 'undefined') {
exports.parser = parser;
exports.Parser = parser.Parser;
exports.parse = function () { return parser.parse.apply(parser, arguments); };
exports.main = function commonjsMain(args) {
    if (!args[1]) {
        console.log('Usage: '+args[0]+' FILE');
        process.exit(1);
    }
    var source = require('fs').readFileSync(require('path').normalize(args[1]), "utf8");
    return exports.parser.parse(source);
};
if (typeof module !== 'undefined' && require.main === module) {
  exports.main(process.argv.slice(1));
}
}
}).call(this,require('_process'))
},{"_process":11,"fs":9,"path":10}],5:[function(require,module,exports){
(function (process){
/* parser generated by jison 0.4.15 */
/*
  Returns a Parser object of the following structure:

  Parser: {
    yy: {}
  }

  Parser.prototype: {
    yy: {},
    trace: function(),
    symbols_: {associative list: name ==> number},
    terminals_: {associative list: number ==> name},
    productions_: [...],
    performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate, $$, _$),
    table: [...],
    defaultActions: {...},
    parseError: function(str, hash),
    parse: function(input),

    lexer: {
        EOF: 1,
        parseError: function(str, hash),
        setInput: function(input),
        input: function(),
        unput: function(str),
        more: function(),
        less: function(n),
        pastInput: function(),
        upcomingInput: function(),
        showPosition: function(),
        test_match: function(regex_match_array, rule_index),
        next: function(),
        lex: function(),
        begin: function(condition),
        popState: function(),
        _currentRules: function(),
        topState: function(),
        pushState: function(condition),

        options: {
            ranges: boolean           (optional: true ==> token location info will include a .range[] member)
            flex: boolean             (optional: true ==> flex-like lexing behaviour where the rules are tested exhaustively to find the longest match)
            backtrack_lexer: boolean  (optional: true ==> lexer regexes are tested in order and for each matching regex the action code is invoked; the lexer terminates the scan when a token is returned by the action code)
        },

        performAction: function(yy, yy_, $avoiding_name_collisions, YY_START),
        rules: [...],
        conditions: {associative list: name ==> set},
    }
  }


  token location info (@$, _$, etc.): {
    first_line: n,
    last_line: n,
    first_column: n,
    last_column: n,
    range: [start_number, end_number]       (where the numbers are indexes into the input string, regular zero-based)
  }


  the parseError function receives a 'hash' object with these members for lexer and parser errors: {
    text:        (matched text)
    token:       (the produced terminal token, if any)
    line:        (yylineno)
  }
  while parser (grammar) errors will also provide these members, i.e. parser errors deliver a superset of attributes: {
    loc:         (yylloc)
    expected:    (string describing the set of expected tokens)
    recoverable: (boolean: TRUE when the parser has a error recovery rule available for this particular error)
  }
*/
var parser = (function(){
var o=function(k,v,o,l){for(o=o||{},l=k.length;l--;o[k[l]]=v);return o},$V0=[1,16,24,41,45,46,47,54,80,83,85,87,88],$V1=[1,16,24,41,45,46,47,54,80,83],$V2=[1,6],$V3=[1,7],$V4=[1,8],$V5=[1,24,41,45,46,47,54,80,83],$V6=[1,14],$V7=[1,80,83],$V8=[1,24],$V9=[1,27],$Va=[1,25],$Vb=[1,31],$Vc=[1,32],$Vd=[1,33],$Ve=[2,113],$Vf=[1,36],$Vg=[1,37],$Vh=[2,104],$Vi=[1,40],$Vj=[1,83],$Vk=[1,45],$Vl=[23,29],$Vm=[1,52],$Vn=[1,53],$Vo=[23,29,85,90,91],$Vp=[23,29,41,46,47,54,85,90,91],$Vq=[1,16,24,41,45,46,47,54,80,83,87,88],$Vr=[2,103],$Vs=[1,67],$Vt=[1,11,12,16,20,23,24,29,32,41,45,46,47,48,51,52,53,54,55,56,60,67,68,69,70,71,72,73,74,77,80,83,85,87,88,90,91,92,93],$Vu=[1,72],$Vv=[24,41,45,46,47,54],$Vw=[12,24,85],$Vx=[1,92],$Vy=[2,12],$Vz=[12,24,32,60],$VA=[12,29],$VB=[12,23,29],$VC=[12,32],$VD=[2,58],$VE=[1,109],$VF=[1,110],$VG=[24,32,41,45,46,47,54],$VH=[1,125],$VI=[2,61],$VJ=[11,24,85],$VK=[1,139],$VL=[11,20,24,41,55,67,68,69,70,71,72,73,74,90,92],$VM=[1,24,32,41,45,46,47,54,80,83,87,88],$VN=[1,167],$VO=[1,169],$VP=[1,168],$VQ=[1,172],$VR=[1,173],$VS=[1,157],$VT=[1,158],$VU=[1,159],$VV=[1,160],$VW=[1,161],$VX=[1,162],$VY=[1,163],$VZ=[1,164],$V_=[1,165],$V$=[1,166],$V01=[48,85],$V11=[1,80,83,87,88],$V21=[12,32,56,77],$V31=[1,184],$V41=[1,183],$V51=[11,12,20,23,24,32,41,55,56,67,68,69,70,71,72,73,74,77,90,92,93],$V61=[67,68,69,70,71,72,73,74],$V71=[11,12,20,23,24,32,41,55,56,67,68,69,70,71,72,73,74,77,85,90,92,93],$V81=[1,83,87,88];
var parser = {trace: function trace() { },
yy: {},
symbols_: {"error":2,"stylesheet":3,"charset":4,"space_cdata_list":5,"import_list":6,"ruleset_list":7,"media_list":8,"page_list":9,"CHARSET_SYM":10,"STRING":11,";":12,"import_item":13,"import":14,"cdo_cdc_space_list":15,"IMPORT_SYM":16,"space_or_empty":17,"string_or_uri":18,"media_query_list":19,"URI":20,"medium":21,"medium_list":22,",":23,"IDENT":24,"ruleset_item":25,"ruleset":26,"selector":27,"selector_list":28,"{":29,"declarations":30,"declaration_list":31,"}":32,"rulesets":33,"simple_selector":34,"combinator":35,"at_least_one_space":36,"element_name":37,"simple_selector_atom_list1":38,"simple_selector_atom_list2":39,"simple_selector_atom":40,"HASH":41,"class":42,"attrib":43,"pseudo":44,"*":45,".":46,"[":47,"]":48,"attrib_operator":49,"attrib_value":50,"=":51,"INCLUDES":52,"DASHMATCH":53,":":54,"FUNCTION":55,")":56,"property":57,"expr":58,"prio":59,"VENDOR":60,"term":61,"term_list":62,"operator":63,"numeric_term":64,"unary_operator":65,"string_term":66,"NUMBER":67,"PERCENTAGE":68,"LENGTH":69,"EMS":70,"EXS":71,"ANGLE":72,"TIME":73,"FREQ":74,"hexcolor":75,"function":76,"IMPORTANT_SYM":77,"media_item":78,"media":79,"MEDIA_SYM":80,"page_item":81,"page":82,"PAGE_SYM":83,"pseudo_pages":84,"S":85,"space_cdata":86,"CDO":87,"CDC":88,"cdo_cdc_space_empty":89,"+":90,">":91,"-":92,"/":93,"$accept":0,"$end":1},
terminals_: {2:"error",10:"CHARSET_SYM",11:"STRING",12:";",16:"IMPORT_SYM",20:"URI",23:",",24:"IDENT",29:"{",32:"}",41:"HASH",45:"*",46:".",47:"[",48:"]",51:"=",52:"INCLUDES",53:"DASHMATCH",54:":",55:"FUNCTION",56:")",60:"VENDOR",67:"NUMBER",68:"PERCENTAGE",69:"LENGTH",70:"EMS",71:"EXS",72:"ANGLE",73:"TIME",74:"FREQ",77:"IMPORTANT_SYM",80:"MEDIA_SYM",83:"PAGE_SYM",85:"S",87:"CDO",88:"CDC",90:"+",91:">",92:"-",93:"/"},
productions_: [0,[3,6],[4,3],[4,0],[6,1],[6,2],[6,0],[13,2],[14,7],[18,1],[18,1],[19,2],[19,0],[22,3],[22,4],[22,0],[21,2],[7,1],[7,2],[7,0],[25,2],[26,8],[33,1],[33,2],[33,0],[28,3],[28,4],[28,0],[27,2],[27,3],[27,3],[27,4],[34,2],[34,1],[38,1],[38,2],[38,0],[39,1],[39,2],[40,1],[40,1],[40,1],[40,1],[37,1],[37,1],[42,2],[43,5],[43,9],[49,1],[49,1],[49,1],[50,1],[50,1],[44,2],[44,4],[44,6],[30,4],[30,5],[30,0],[31,3],[31,4],[31,0],[57,2],[57,2],[58,2],[62,1],[62,2],[62,2],[62,3],[62,0],[61,1],[61,2],[61,1],[64,2],[64,2],[64,2],[64,2],[64,2],[64,2],[64,2],[64,2],[66,2],[66,2],[66,2],[66,2],[66,2],[59,2],[76,5],[75,2],[8,1],[8,2],[8,0],[78,2],[79,8],[9,1],[9,2],[9,0],[81,2],[82,9],[84,3],[84,0],[36,1],[36,2],[17,1],[17,0],[5,1],[5,2],[5,0],[86,1],[86,1],[86,1],[15,1],[15,2],[15,0],[89,2],[89,2],[35,2],[35,2],[65,1],[65,1],[63,2],[63,2]],
performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate /* action[1] */, $$ /* vstack */, _$ /* lstack */) {
/* this == yyval */

var $0 = $$.length - 1;
switch (yystate) {
case 1:

      this.$ = {};
      if($$[$0-5]) this.$['charset']  	= $$[$0-5];
      if($$[$0-3]) this.$['imports']  	= $$[$0-3];
      if($$[$0-2]) this.$['rulesets'] 	= $$[$0-2];
      if($$[$0-1]) this.$['medias'] 	= $$[$0-1];
      if($$[$0]) this.$['pages'] 	= $$[$0];
      return this.$;
    
break;
case 2: case 7: case 16: case 20: case 62: case 63: case 75: case 76: case 77: case 78: case 79: case 80: case 81: case 82: case 83: case 84: case 85: case 86: case 88: case 92: case 97: case 99: case 116: case 117: case 120: case 121:
this.$ = $$[$0-1];
break;
case 3: case 36: case 104:
this.$ = "";
break;
case 4: case 13: case 59:

      this.$ = [];
      if ($$[$0] !== null) this.$.push($$[$0]);
    
break;
case 5:

      this.$ = $$[$0-1];
      if ($$[$0] !== null) this.$.push($$[$0]);
    
break;
case 6: case 12: case 15: case 19: case 24: case 27: case 58: case 61: case 69: case 91: case 96: case 100: case 105: case 106: case 107: case 108: case 109: case 110: case 111: case 112: case 113: case 114: case 115:
this.$ = null;
break;
case 8:

      this.$ = {}
      if ($$[$0-4] !== null) this.$["import"] = $$[$0-4];
      if ($$[$0-2] !== null) this.$["mediaqueries"] = $$[$0-2];
    
break;
case 9: case 10: case 17: case 22: case 33: case 34: case 37: case 39: case 40: case 41: case 42: case 43: case 44: case 48: case 49: case 50: case 51: case 52: case 65: case 70: case 72: case 89: case 94: case 103: case 118: case 119:
this.$ = $$[$0];
break;
case 11:

      this.$ = [];
      if ($$[$0-1] !== null) this.$.push($$[$0-1]);
      if ($$[$0] !== null) {
        var r = this.$;
        $$[$0].forEach(function(e) {
          r.push(e);
        });
      }
    
break;
case 14:

      this.$ = [];
      if ($$[$0-3] !== null) this.$ = S1;
      if ($$[$0] !== null) this.$.push($$[$0]);
    
break;
case 18: case 90: case 95:

      this.$ = $$[$0-1];
      var r = this.$;
      $$[$0] !== null? $$[$0].forEach(function(e) { r.push(e); }) : ''
    
break;
case 21:

      this.$ = [];
      if ($$[$0-7] !== null) {
        var s = {};
        s.selector = $$[$0-7];
        s.declaration = [];
        $$[$0-3] !== null? s.declaration.push($$[$0-3]) : '';
        $$[$0-2] !== null? $$[$0-2].forEach(function(d) { s.declaration.push(d); }) : ''
        this.$.push(s);
      }
      if ($$[$0-6] !== null) {
        var r = this.$;
        $$[$0-6].forEach(function(e) {
          var s = {};
          s.selector = e;
          s.declaration = [];
          $$[$0-3] !== null? s.declaration.push($$[$0-3]) : '';
          $$[$0-2] !== null? $$[$0-2].forEach(function(d) { s.declaration.push(d); }) : ''
          r.push(s);
        });
      }
    
break;
case 23:

      this.$ = [];
      this.$ = $$[$0-1];
      var r = this.$;
      $$[$0] !== null? $$[$0].forEach(function(e) { r.push(e); }) : ''
    
break;
case 25:

      this.$ = [];
      this.$.push($$[$0]);
    
break;
case 26: case 60:

      this.$ = [];
      this.$ = $$[$0-3];
      if ($$[$0] !== null) this.$.push($$[$0]);
    
break;
case 28:
this.$ = $$[$0-1]			/* modified: the space_or_empty is not defined in the spec */;
break;
case 29:
this.$ = $$[$0-2] + $$[$0-1] + $$[$0];
break;
case 30:
this.$ = $$[$0-2] + ' ' + $$[$0];
break;
case 31:
this.$ = $$[$0-3] + $$[$0-1] + $$[$0]		/* TODO: should i add the space like above production? */;
break;
case 32: case 35: case 38: case 45: case 53: case 66: case 71:
this.$ = $$[$0-1] + $$[$0];
break;
case 46:
this.$ = $$[$0-4] + $$[$0-2] + $$[$0];
break;
case 47:
this.$ = $$[$0-8] + $$[$0-6] + $$[$0-4] + $$[$0-2] + $$[$0];
break;
case 54:
this.$ = $$[$0-3] + $$[$0-2] + $$[$0];
break;
case 55:
this.$ = $$[$0-5] + $$[$0-4] + $$[$0-2] + $$[$0];
break;
case 56:

      this.$ = {};
      this.$.key = $$[$0-3];
      this.$.value = $$[$0];
    
break;
case 57:

      this.$ = {};
      this.$.key = $$[$0-4];
      this.$.value = $$[$0-1] + ' ' + $$[$0];				/* TODO: should i need to add a space */
    
break;
case 64:

      this.$ = $$[$0-1];
      if ($$[$0] !== null) this.$ = $$[$0-1] + ' ' + $$[$0];
    
break;
case 67:
this.$ = $$[$0-1] + ' ' + $$[$0];
break;
case 68:
this.$ = $$[$0-2] + ' ' + $$[$0-1] + $$[$0];
break;
case 73: case 74:
this.$ = $$[$0-1] ;
break;
case 87:
this.$ = $$[$0-4] + $$[$0-2] + $$[$0-1];
break;
case 93:

      this.$ = {}
      if ($$[$0-5] !== null) this.$["mediaqueries"] = $$[$0-5];
      if ($$[$0-2] !== null) this.$["rulesets"] = $$[$0-2];
    
break;
case 98:

      this.$ = {};
      var s = this.$;

      $$[$0-6] !== null? this.$.pseudo_class = $$[$0-6] : '';
      this.$.declaration = [];
      $$[$0-3] !== null? this.$.declaration.push($$[$0-3]) : '';
      $$[$0-2] !== null? $$[$0-2].forEach(function(d) { s.declaration.push(d); }) : ''
    
break;
case 101: case 102:
this.$ = " ";
break;
}
},
table: [o($V0,[2,3],{3:1,4:2,10:[1,3]}),{1:[3]},o($V1,[2,107],{5:4,86:5,85:$V2,87:$V3,88:$V4}),{11:[1,9]},o($V5,[2,6],{6:10,86:11,13:12,14:13,16:$V6,85:$V2,87:$V3,88:$V4}),o($V0,[2,105]),o($V0,[2,108]),o($V0,[2,109]),o($V0,[2,110]),{12:[1,15]},o($V7,[2,19],{14:13,7:16,13:17,25:18,26:19,27:20,34:21,37:22,39:23,40:26,42:28,43:29,44:30,16:$V6,24:$V8,41:$V9,45:$Va,46:$Vb,47:$Vc,54:$Vd}),o($V0,[2,106]),o($V1,[2,4]),o($V1,$Ve,{15:34,89:35,87:$Vf,88:$Vg}),o([11,20],$Vh,{17:38,36:39,85:$Vi}),o($V0,[2,2]),o($Vj,[2,91],{26:19,27:20,34:21,37:22,39:23,40:26,42:28,43:29,44:30,8:41,25:42,78:43,79:44,24:$V8,41:$V9,45:$Va,46:$Vb,47:$Vc,54:$Vd,80:$Vk}),o($V1,[2,5]),o($V5,[2,17]),o($V5,$Ve,{89:35,15:46,87:$Vf,88:$Vg}),{23:[1,48],28:47,29:[2,27]},o($Vl,$Vh,{17:49,35:50,36:51,85:$Vi,90:$Vm,91:$Vn}),o($Vo,[2,36],{42:28,43:29,44:30,38:54,40:55,41:$V9,46:$Vb,47:$Vc,54:$Vd}),o($Vo,[2,33],{42:28,43:29,44:30,40:56,41:$V9,46:$Vb,47:$Vc,54:$Vd}),o($Vp,[2,43]),o($Vp,[2,44]),o($Vp,[2,37]),o($Vp,[2,39]),o($Vp,[2,40]),o($Vp,[2,41]),o($Vp,[2,42]),{24:[1,57]},{17:58,24:$Vh,36:39,85:$Vi},{24:[1,59],55:[1,60]},o($V1,[2,7],{89:61,87:$Vf,88:$Vg}),o($Vq,[2,111]),o($Vq,$Vh,{36:39,17:62,85:$Vi}),o($Vq,$Vh,{36:39,17:63,85:$Vi}),{11:[1,65],18:64,20:[1,66]},o([1,11,12,16,20,23,24,29,32,41,45,46,47,48,51,52,53,54,55,56,60,67,68,69,70,71,72,73,74,77,80,83,87,88,90,92,93],$Vr,{85:$Vs}),o($Vt,[2,101]),{1:[2,96],9:68,78:69,79:44,80:$Vk,81:70,82:71,83:$Vu},o($V5,[2,18]),o($V7,[2,89]),o($V7,$Ve,{89:35,15:73,87:$Vf,88:$Vg}),o([24,29],$Vh,{36:39,17:74,85:$Vi}),o($V5,[2,20],{89:61,87:$Vf,88:$Vg}),{23:[1,76],29:[1,75]},o($Vv,$Vh,{36:39,17:77,85:$Vi}),o($Vl,[2,28]),{24:$V8,27:78,34:21,37:22,39:23,40:26,41:$V9,42:28,43:29,44:30,45:$Va,46:$Vb,47:$Vc,54:$Vd},o($Vl,$Vr,{34:21,37:22,39:23,40:26,42:28,43:29,44:30,27:79,35:80,24:$V8,41:$V9,45:$Va,46:$Vb,47:$Vc,54:$Vd,85:$Vs,90:$Vm,91:$Vn}),o($Vv,$Vh,{36:39,17:81,85:$Vi}),o($Vv,$Vh,{36:39,17:82,85:$Vi}),o($Vo,[2,32],{42:28,43:29,44:30,40:83,41:$V9,46:$Vb,47:$Vc,54:$Vd}),o($Vp,[2,34]),o($Vp,[2,38]),o($Vp,[2,45]),{24:[1,84]},o($Vp,[2,53]),o([24,56],$Vh,{36:39,17:85,85:$Vi}),o($Vq,[2,112]),o($Vq,[2,114]),o($Vq,[2,115]),o([12,24],$Vh,{36:39,17:86,85:$Vi}),o($Vw,[2,9]),o($Vw,[2,10]),o($Vt,[2,102]),{1:[2,1],81:87,82:71,83:$Vu},o($V7,[2,90]),o($Vj,[2,94]),o($Vj,$Ve,{89:35,15:88,87:$Vf,88:$Vg}),o([29,54],$Vh,{36:39,17:89,85:$Vi}),o($V7,[2,92],{89:61,87:$Vf,88:$Vg}),{19:90,21:91,24:$Vx,29:$Vy},o($Vz,$Vh,{36:39,17:93,85:$Vi}),o($Vv,$Vh,{36:39,17:94,85:$Vi}),{24:$V8,27:95,34:21,37:22,39:23,40:26,41:$V9,42:28,43:29,44:30,45:$Va,46:$Vb,47:$Vc,54:$Vd},o($Vl,[2,29]),o($Vl,[2,30]),{24:$V8,27:96,34:21,37:22,39:23,40:26,41:$V9,42:28,43:29,44:30,45:$Va,46:$Vb,47:$Vc,54:$Vd},o($Vv,[2,116]),o($Vv,[2,117]),o($Vp,[2,35]),o([48,51,52,53],$Vh,{36:39,17:97,85:$Vi}),{24:[1,99],56:[1,98]},{12:$Vy,19:100,21:91,24:$Vx},o($Vj,[2,95]),o($Vj,[2,97],{89:61,87:$Vf,88:$Vg}),{29:[2,100],54:[1,102],84:101},{29:[1,103]},o($VA,[2,15],{22:104,23:[1,105]}),o($VB,$Vh,{36:39,17:106,85:$Vi}),o($VC,$VD,{30:107,57:108,24:$VE,60:$VF}),{24:$V8,27:111,34:21,37:22,39:23,40:26,41:$V9,42:28,43:29,44:30,45:$Va,46:$Vb,47:$Vc,54:$Vd},o($Vl,[2,25]),o($Vl,[2,31]),{48:[1,112],49:113,51:[1,114],52:[1,115],53:[1,116]},o($Vp,[2,54]),{17:117,36:39,56:$Vh,85:$Vi},{12:[1,118]},{29:[1,119]},{24:[1,120]},o($VG,$Vh,{36:39,17:121,85:$Vi}),o($VA,[2,11],{23:[1,122]}),{17:123,24:$Vh,36:39,85:$Vi},o($VB,[2,16]),{12:$VH,31:124,32:$VI},{54:[1,126]},{17:127,36:39,54:$Vh,85:$Vi},{17:128,36:39,54:$Vh,85:$Vi},o($Vl,[2,26]),o($Vp,[2,46]),o([11,24],$Vh,{36:39,17:129,85:$Vi}),o($VJ,[2,48]),o($VJ,[2,49]),o($VJ,[2,50]),{56:[1,130]},o($Vq,$Vh,{36:39,17:131,85:$Vi}),o($Vz,$Vh,{36:39,17:132,85:$Vi}),{17:133,29:$Vh,36:39,85:$Vi},{24:$V8,26:135,27:20,32:[2,24],33:134,34:21,37:22,39:23,40:26,41:$V9,42:28,43:29,44:30,45:$Va,46:$Vb,47:$Vc,54:$Vd},{17:136,24:$Vh,36:39,85:$Vi},{21:137,24:$Vx},{12:$VK,32:[1,138]},o($Vz,$Vh,{36:39,17:140,85:$Vi}),o($VL,$Vh,{36:39,17:141,85:$Vi}),{54:[2,62]},{54:[2,63]},{11:[1,144],24:[1,143],50:142},o($Vp,[2,55]),o($Vq,[2,8]),o($VC,$VD,{57:108,30:145,24:$VE,60:$VF}),{29:[2,99]},{24:$V8,26:147,27:20,32:[1,146],34:21,37:22,39:23,40:26,41:$V9,42:28,43:29,44:30,45:$Va,46:$Vb,47:$Vc,54:$Vd},o($VG,[2,22]),{21:148,24:$Vx},o($VB,[2,13]),o($VM,$Vh,{36:39,17:149,85:$Vi}),o($Vz,$Vh,{36:39,17:150,85:$Vi}),o($VC,$VD,{57:108,30:151,24:$VE,60:$VF}),{11:$VN,20:$VO,24:$VP,41:$VQ,55:$VR,58:152,61:153,64:154,65:155,66:156,67:$VS,68:$VT,69:$VU,70:$VV,71:$VW,72:$VX,73:$VY,74:$VZ,75:170,76:171,90:$V_,92:$V$},{17:174,36:39,48:$Vh,85:$Vi},o($V01,[2,51]),o($V01,[2,52]),{12:$VH,31:175,32:$VI},o($V11,$Vh,{36:39,17:176,85:$Vi}),o($VG,[2,23]),o($VB,[2,14]),o($VM,[2,21]),o($VC,$VD,{57:108,30:177,24:$VE,60:$VF}),o($VC,[2,59]),o($VC,[2,56],{59:178,77:[1,179]}),o($V21,[2,69],{64:154,65:155,66:156,75:170,76:171,62:180,61:181,63:182,11:$VN,20:$VO,23:$V31,24:$VP,41:$VQ,55:$VR,67:$VS,68:$VT,69:$VU,70:$VV,71:$VW,72:$VX,73:$VY,74:$VZ,90:$V_,92:$V$,93:$V41}),o($V51,[2,70]),{64:185,67:$VS,68:$VT,69:$VU,70:$VV,71:$VW,72:$VX,73:$VY,74:$VZ},o($V51,[2,72]),o($V51,$Vh,{36:39,17:186,85:$Vi}),o($V51,$Vh,{36:39,17:187,85:$Vi}),o($V51,$Vh,{36:39,17:188,85:$Vi}),o($V51,$Vh,{36:39,17:189,85:$Vi}),o($V51,$Vh,{36:39,17:190,85:$Vi}),o($V51,$Vh,{36:39,17:191,85:$Vi}),o($V51,$Vh,{36:39,17:192,85:$Vi}),o($V51,$Vh,{36:39,17:193,85:$Vi}),o($V61,[2,118]),o($V61,[2,119]),o($V51,$Vh,{36:39,17:194,85:$Vi}),o($V51,$Vh,{36:39,17:195,85:$Vi}),o($V51,$Vh,{36:39,17:196,85:$Vi}),o($V51,$Vh,{36:39,17:197,85:$Vi}),o($V51,$Vh,{36:39,17:198,85:$Vi}),o($V51,$Vh,{36:39,17:199,85:$Vi}),o($VL,$Vh,{36:39,17:200,85:$Vi}),{48:[1,201]},{12:$VK,32:[1,202]},o($V11,[2,93]),o($VC,[2,60]),o($VC,[2,57]),o($VC,$Vh,{36:39,17:203,85:$Vi}),o($V21,[2,64],{64:154,65:155,66:156,75:170,76:171,61:204,63:205,11:$VN,20:$VO,23:$V31,24:$VP,41:$VQ,55:$VR,67:$VS,68:$VT,69:$VU,70:$VV,71:$VW,72:$VX,73:$VY,74:$VZ,90:$V_,92:$V$,93:$V41}),o($V51,[2,65]),{11:$VN,20:$VO,24:$VP,41:$VQ,55:$VR,61:206,64:154,65:155,66:156,67:$VS,68:$VT,69:$VU,70:$VV,71:$VW,72:$VX,73:$VY,74:$VZ,75:170,76:171,90:$V_,92:$V$},o($VL,$Vh,{36:39,17:207,85:$Vi}),o($VL,$Vh,{36:39,17:208,85:$Vi}),o($V51,[2,71]),o($V51,[2,73]),o($V51,[2,74]),o($V51,[2,75]),o($V51,[2,76]),o($V51,[2,77]),o($V51,[2,78]),o($V51,[2,79]),o($V51,[2,80]),o($V51,[2,81]),o($V51,[2,82]),o($V51,[2,83]),o($V51,[2,84]),o($V51,[2,85]),o($V71,[2,88]),{11:$VN,20:$VO,24:$VP,41:$VQ,55:$VR,58:209,61:153,64:154,65:155,66:156,67:$VS,68:$VT,69:$VU,70:$VV,71:$VW,72:$VX,73:$VY,74:$VZ,75:170,76:171,90:$V_,92:$V$},o($Vp,[2,47]),o($V81,$Vh,{36:39,17:210,85:$Vi}),o($VC,[2,86]),o($V51,[2,67]),{11:$VN,20:$VO,24:$VP,41:$VQ,55:$VR,61:211,64:154,65:155,66:156,67:$VS,68:$VT,69:$VU,70:$VV,71:$VW,72:$VX,73:$VY,74:$VZ,75:170,76:171,90:$V_,92:$V$},o($V51,[2,66]),o($VL,[2,120]),o($VL,[2,121]),{56:[1,212]},o($V81,[2,98]),o($V51,[2,68]),o($V51,$Vh,{36:39,17:213,85:$Vi}),o($V71,[2,87])],
defaultActions: {127:[2,62],128:[2,63],133:[2,99]},
parseError: function parseError(str, hash) {
    if (hash.recoverable) {
        this.trace(str);
    } else {
        throw new Error(str);
    }
},
parse: function parse(input) {
    var self = this, stack = [0], tstack = [], vstack = [null], lstack = [], table = this.table, yytext = '', yylineno = 0, yyleng = 0, recovering = 0, TERROR = 2, EOF = 1;
    var args = lstack.slice.call(arguments, 1);
    var lexer = Object.create(this.lexer);
    var sharedState = { yy: {} };
    for (var k in this.yy) {
        if (Object.prototype.hasOwnProperty.call(this.yy, k)) {
            sharedState.yy[k] = this.yy[k];
        }
    }
    lexer.setInput(input, sharedState.yy);
    sharedState.yy.lexer = lexer;
    sharedState.yy.parser = this;
    if (typeof lexer.yylloc == 'undefined') {
        lexer.yylloc = {};
    }
    var yyloc = lexer.yylloc;
    lstack.push(yyloc);
    var ranges = lexer.options && lexer.options.ranges;
    if (typeof sharedState.yy.parseError === 'function') {
        this.parseError = sharedState.yy.parseError;
    } else {
        this.parseError = Object.getPrototypeOf(this).parseError;
    }
    function popStack(n) {
        stack.length = stack.length - 2 * n;
        vstack.length = vstack.length - n;
        lstack.length = lstack.length - n;
    }
    _token_stack:
        function lex() {
            var token;
            token = lexer.lex() || EOF;
            if (typeof token !== 'number') {
                token = self.symbols_[token] || token;
            }
            return token;
        }
    var symbol, preErrorSymbol, state, action, a, r, yyval = {}, p, len, newState, expected;
    while (true) {
        state = stack[stack.length - 1];
        if (this.defaultActions[state]) {
            action = this.defaultActions[state];
        } else {
            if (symbol === null || typeof symbol == 'undefined') {
                symbol = lex();
            }
            action = table[state] && table[state][symbol];
        }
                    if (typeof action === 'undefined' || !action.length || !action[0]) {
                var errStr = '';
                expected = [];
                for (p in table[state]) {
                    if (this.terminals_[p] && p > TERROR) {
                        expected.push('\'' + this.terminals_[p] + '\'');
                    }
                }
                if (lexer.showPosition) {
                    errStr = 'Parse error on line ' + (yylineno + 1) + ':\n' + lexer.showPosition() + '\nExpecting ' + expected.join(', ') + ', got \'' + (this.terminals_[symbol] || symbol) + '\'';
                } else {
                    errStr = 'Parse error on line ' + (yylineno + 1) + ': Unexpected ' + (symbol == EOF ? 'end of input' : '\'' + (this.terminals_[symbol] || symbol) + '\'');
                }
                this.parseError(errStr, {
                    text: lexer.match,
                    token: this.terminals_[symbol] || symbol,
                    line: lexer.yylineno,
                    loc: yyloc,
                    expected: expected
                });
            }
        if (action[0] instanceof Array && action.length > 1) {
            throw new Error('Parse Error: multiple actions possible at state: ' + state + ', token: ' + symbol);
        }
        switch (action[0]) {
        case 1:
            stack.push(symbol);
            vstack.push(lexer.yytext);
            lstack.push(lexer.yylloc);
            stack.push(action[1]);
            symbol = null;
            if (!preErrorSymbol) {
                yyleng = lexer.yyleng;
                yytext = lexer.yytext;
                yylineno = lexer.yylineno;
                yyloc = lexer.yylloc;
                if (recovering > 0) {
                    recovering--;
                }
            } else {
                symbol = preErrorSymbol;
                preErrorSymbol = null;
            }
            break;
        case 2:
            len = this.productions_[action[1]][1];
            yyval.$ = vstack[vstack.length - len];
            yyval._$ = {
                first_line: lstack[lstack.length - (len || 1)].first_line,
                last_line: lstack[lstack.length - 1].last_line,
                first_column: lstack[lstack.length - (len || 1)].first_column,
                last_column: lstack[lstack.length - 1].last_column
            };
            if (ranges) {
                yyval._$.range = [
                    lstack[lstack.length - (len || 1)].range[0],
                    lstack[lstack.length - 1].range[1]
                ];
            }
            r = this.performAction.apply(yyval, [
                yytext,
                yyleng,
                yylineno,
                sharedState.yy,
                action[1],
                vstack,
                lstack
            ].concat(args));
            if (typeof r !== 'undefined') {
                return r;
            }
            if (len) {
                stack = stack.slice(0, -1 * len * 2);
                vstack = vstack.slice(0, -1 * len);
                lstack = lstack.slice(0, -1 * len);
            }
            stack.push(this.productions_[action[1]][0]);
            vstack.push(yyval.$);
            lstack.push(yyval._$);
            newState = table[stack[stack.length - 2]][stack[stack.length - 1]];
            stack.push(newState);
            break;
        case 3:
            return true;
        }
    }
    return true;
}};
/* generated by jison-lex 0.3.4 */
var lexer = (function(){
var lexer = ({

EOF:1,

parseError:function parseError(str, hash) {
        if (this.yy.parser) {
            this.yy.parser.parseError(str, hash);
        } else {
            throw new Error(str);
        }
    },

// resets the lexer, sets new input
setInput:function (input, yy) {
        this.yy = yy || this.yy || {};
        this._input = input;
        this._more = this._backtrack = this.done = false;
        this.yylineno = this.yyleng = 0;
        this.yytext = this.matched = this.match = '';
        this.conditionStack = ['INITIAL'];
        this.yylloc = {
            first_line: 1,
            first_column: 0,
            last_line: 1,
            last_column: 0
        };
        if (this.options.ranges) {
            this.yylloc.range = [0,0];
        }
        this.offset = 0;
        return this;
    },

// consumes and returns one char from the input
input:function () {
        var ch = this._input[0];
        this.yytext += ch;
        this.yyleng++;
        this.offset++;
        this.match += ch;
        this.matched += ch;
        var lines = ch.match(/(?:\r\n?|\n).*/g);
        if (lines) {
            this.yylineno++;
            this.yylloc.last_line++;
        } else {
            this.yylloc.last_column++;
        }
        if (this.options.ranges) {
            this.yylloc.range[1]++;
        }

        this._input = this._input.slice(1);
        return ch;
    },

// unshifts one char (or a string) into the input
unput:function (ch) {
        var len = ch.length;
        var lines = ch.split(/(?:\r\n?|\n)/g);

        this._input = ch + this._input;
        this.yytext = this.yytext.substr(0, this.yytext.length - len);
        //this.yyleng -= len;
        this.offset -= len;
        var oldLines = this.match.split(/(?:\r\n?|\n)/g);
        this.match = this.match.substr(0, this.match.length - 1);
        this.matched = this.matched.substr(0, this.matched.length - 1);

        if (lines.length - 1) {
            this.yylineno -= lines.length - 1;
        }
        var r = this.yylloc.range;

        this.yylloc = {
            first_line: this.yylloc.first_line,
            last_line: this.yylineno + 1,
            first_column: this.yylloc.first_column,
            last_column: lines ?
                (lines.length === oldLines.length ? this.yylloc.first_column : 0)
                 + oldLines[oldLines.length - lines.length].length - lines[0].length :
              this.yylloc.first_column - len
        };

        if (this.options.ranges) {
            this.yylloc.range = [r[0], r[0] + this.yyleng - len];
        }
        this.yyleng = this.yytext.length;
        return this;
    },

// When called from action, caches matched text and appends it on next action
more:function () {
        this._more = true;
        return this;
    },

// When called from action, signals the lexer that this rule fails to match the input, so the next matching rule (regex) should be tested instead.
reject:function () {
        if (this.options.backtrack_lexer) {
            this._backtrack = true;
        } else {
            return this.parseError('Lexical error on line ' + (this.yylineno + 1) + '. You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).\n' + this.showPosition(), {
                text: "",
                token: null,
                line: this.yylineno
            });

        }
        return this;
    },

// retain first n characters of the match
less:function (n) {
        this.unput(this.match.slice(n));
    },

// displays already matched input, i.e. for error messages
pastInput:function () {
        var past = this.matched.substr(0, this.matched.length - this.match.length);
        return (past.length > 20 ? '...':'') + past.substr(-20).replace(/\n/g, "");
    },

// displays upcoming input, i.e. for error messages
upcomingInput:function () {
        var next = this.match;
        if (next.length < 20) {
            next += this._input.substr(0, 20-next.length);
        }
        return (next.substr(0,20) + (next.length > 20 ? '...' : '')).replace(/\n/g, "");
    },

// displays the character position where the lexing error occurred, i.e. for error messages
showPosition:function () {
        var pre = this.pastInput();
        var c = new Array(pre.length + 1).join("-");
        return pre + this.upcomingInput() + "\n" + c + "^";
    },

// test the lexed token: return FALSE when not a match, otherwise return token
test_match:function (match, indexed_rule) {
        var token,
            lines,
            backup;

        if (this.options.backtrack_lexer) {
            // save context
            backup = {
                yylineno: this.yylineno,
                yylloc: {
                    first_line: this.yylloc.first_line,
                    last_line: this.last_line,
                    first_column: this.yylloc.first_column,
                    last_column: this.yylloc.last_column
                },
                yytext: this.yytext,
                match: this.match,
                matches: this.matches,
                matched: this.matched,
                yyleng: this.yyleng,
                offset: this.offset,
                _more: this._more,
                _input: this._input,
                yy: this.yy,
                conditionStack: this.conditionStack.slice(0),
                done: this.done
            };
            if (this.options.ranges) {
                backup.yylloc.range = this.yylloc.range.slice(0);
            }
        }

        lines = match[0].match(/(?:\r\n?|\n).*/g);
        if (lines) {
            this.yylineno += lines.length;
        }
        this.yylloc = {
            first_line: this.yylloc.last_line,
            last_line: this.yylineno + 1,
            first_column: this.yylloc.last_column,
            last_column: lines ?
                         lines[lines.length - 1].length - lines[lines.length - 1].match(/\r?\n?/)[0].length :
                         this.yylloc.last_column + match[0].length
        };
        this.yytext += match[0];
        this.match += match[0];
        this.matches = match;
        this.yyleng = this.yytext.length;
        if (this.options.ranges) {
            this.yylloc.range = [this.offset, this.offset += this.yyleng];
        }
        this._more = false;
        this._backtrack = false;
        this._input = this._input.slice(match[0].length);
        this.matched += match[0];
        token = this.performAction.call(this, this.yy, this, indexed_rule, this.conditionStack[this.conditionStack.length - 1]);
        if (this.done && this._input) {
            this.done = false;
        }
        if (token) {
            return token;
        } else if (this._backtrack) {
            // recover context
            for (var k in backup) {
                this[k] = backup[k];
            }
            return false; // rule action called reject() implying the next rule should be tested instead.
        }
        return false;
    },

// return next match in input
next:function () {
        if (this.done) {
            return this.EOF;
        }
        if (!this._input) {
            this.done = true;
        }

        var token,
            match,
            tempMatch,
            index;
        if (!this._more) {
            this.yytext = '';
            this.match = '';
        }
        var rules = this._currentRules();
        for (var i = 0; i < rules.length; i++) {
            tempMatch = this._input.match(this.rules[rules[i]]);
            if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
                match = tempMatch;
                index = i;
                if (this.options.backtrack_lexer) {
                    token = this.test_match(tempMatch, rules[i]);
                    if (token !== false) {
                        return token;
                    } else if (this._backtrack) {
                        match = false;
                        continue; // rule action called reject() implying a rule MISmatch.
                    } else {
                        // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
                        return false;
                    }
                } else if (!this.options.flex) {
                    break;
                }
            }
        }
        if (match) {
            token = this.test_match(match, rules[index]);
            if (token !== false) {
                return token;
            }
            // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
            return false;
        }
        if (this._input === "") {
            return this.EOF;
        } else {
            return this.parseError('Lexical error on line ' + (this.yylineno + 1) + '. Unrecognized text.\n' + this.showPosition(), {
                text: "",
                token: null,
                line: this.yylineno
            });
        }
    },

// return next match that has a token
lex:function lex() {
        var r = this.next();
        if (r) {
            return r;
        } else {
            return this.lex();
        }
    },

// activates a new lexer condition state (pushes the new lexer condition state onto the condition stack)
begin:function begin(condition) {
        this.conditionStack.push(condition);
    },

// pop the previously active lexer condition state off the condition stack
popState:function popState() {
        var n = this.conditionStack.length - 1;
        if (n > 0) {
            return this.conditionStack.pop();
        } else {
            return this.conditionStack[0];
        }
    },

// produce the lexer rule set which is active for the currently active lexer condition state
_currentRules:function _currentRules() {
        if (this.conditionStack.length && this.conditionStack[this.conditionStack.length - 1]) {
            return this.conditions[this.conditionStack[this.conditionStack.length - 1]].rules;
        } else {
            return this.conditions["INITIAL"].rules;
        }
    },

// return the currently active lexer condition state; when an index argument is provided it produces the N-th previous condition state, if available
topState:function topState(n) {
        n = this.conditionStack.length - 1 - Math.abs(n || 0);
        if (n >= 0) {
            return this.conditionStack[n];
        } else {
            return "INITIAL";
        }
    },

// alias for begin(condition)
pushState:function pushState(condition) {
        this.begin(condition);
    },

// return the number of states currently on the stack
stateStackSize:function stateStackSize() {
        return this.conditionStack.length;
    },
options: {},
performAction: function anonymous(yy,yy_,$avoiding_name_collisions,YY_START) {
var YYSTATE=YY_START;
switch($avoiding_name_collisions) {
case 0:return 85;
break;
case 1:
break;
case 2:
break;
case 3:return 87;
break;
case 4:return 88;
break;
case 5:return 52;
break;
case 6:return 53;
break;
case 7:return 11;
break;
case 8:return 'BAD_STRING';
break;
case 9:return 20;
break;
case 10:return 20;
break;
case 11:return 'BAD_URI';
break;
case 12:return 77;
break;
case 13:return 16;
break;
case 14:return 83;
break;
case 15:return 80;
break;
case 16:return 10;
break;
case 17:return 'UNICODERANGE';
break;
case 18:return 55;
break;
case 19:return 24;
break;
case 20:return 60;
break;
case 21:return 'ATKEYWORD';
break;
case 22:return 41;
break;
case 23:return 70;
break;
case 24:return 71;
break;
case 25:return 69;
break;
case 26:return 69;
break;
case 27:return 69;
break;
case 28:return 69;
break;
case 29:return 69;
break;
case 30:return 69;
break;
case 31:return 72;
break;
case 32:return 72;
break;
case 33:return 72;
break;
case 34:return 73;
break;
case 35:return 73;
break;
case 36:return 74;
break;
case 37:return 74;
break;
case 38:return 'DIMENSION';
break;
case 39:return 68;
break;
case 40:return 67;
break;
case 41:return yy_.yytext; /* 'DELIM'; */
break;
}
},
rules: [/^(?:([ \t\r\n\f]+))/,/^(?:\/\*[^*]*\*+([^/*][^*]*\*+)*\/)/,/^(?:((\/\*[^*]*\*+([^/*][^*]*\*+)*)|(\/\*[^*]*(\*+[^/*][^*]*)*)))/,/^(?:<!--)/,/^(?:-->)/,/^(?:~=)/,/^(?:\|=)/,/^(?:(("([^\n\r\f\\"]|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*")|('([^\n\r\f\\']|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*')))/,/^(?:(("([^\n\r\f\\"]|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*\\?)|('([^\n\r\f\\']|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*\\?)))/,/^(?:url\((([ \t\r\n\f]+)?)(("([^\n\r\f\\"]|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*")|('([^\n\r\f\\']|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*'))(([ \t\r\n\f]+)?)\))/,/^(?:url\((([ \t\r\n\f]+)?)(([!#$%&*-~]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*)(([ \t\r\n\f]+)?)\))/,/^(?:((url\((([ \t\r\n\f]+)?)([!#$%&*-\[\]-~]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*(([ \t\r\n\f]+)?))|(url\((([ \t\r\n\f]+)?)(("([^\n\r\f\\"]|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*")|('([^\n\r\f\\']|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*'))(([ \t\r\n\f]+)?))|(url\((([ \t\r\n\f]+)?)(("([^\n\r\f\\"]|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*\\?)|('([^\n\r\f\\']|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*\\?)))))/,/^(?:!((([ \t\r\n\f]+)?)|(\/\*[^*]*\*+([^/*][^*]*\*+)*\/))*(I|i|\\0{0,4}(49|69)(\r\n|[ \t\r\n\f])?|\\[i])(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m])(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(O|o|\\0{0,4}(4f|6f)(\r\n|[ \t\r\n\f])?|\\[o])(R|r|\\0{0,4}(52|72)(\r\n|[ \t\r\n\f])?|\\[r])(T|t|\\0{0,4}(54|74)(\r\n|[ \t\r\n\f])?|\\[t])(A|a|\\0{0,4}(41|61)(\r\n|[ \t\r\n\f])?)(N|n|\\0{0,4}(4e|6e)(\r\n|[ \t\r\n\f])?|\\[n])(T|t|\\0{0,4}(54|74)(\r\n|[ \t\r\n\f])?|\\[t]))/,/^(?:@(I|i|\\0{0,4}(49|69)(\r\n|[ \t\r\n\f])?|\\[i])(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m])(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(O|o|\\0{0,4}(4f|6f)(\r\n|[ \t\r\n\f])?|\\[o])(R|r|\\0{0,4}(52|72)(\r\n|[ \t\r\n\f])?|\\[r])(T|t|\\0{0,4}(54|74)(\r\n|[ \t\r\n\f])?|\\[t]))/,/^(?:@(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(A|a|\\0{0,4}(41|61)(\r\n|[ \t\r\n\f])?)(G|g|\\0{0,4}(47|67)(\r\n|[ \t\r\n\f])?|\\[g])(E|e|\\0{0,4}(45|65)(\r\n|[ \t\r\n\f])?))/,/^(?:@(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m])(E|e|\\0{0,4}(45|65)(\r\n|[ \t\r\n\f])?)(D|d|\\0{0,4}(44|64)(\r\n|[ \t\r\n\f])?)(I|i|\\0{0,4}(49|69)(\r\n|[ \t\r\n\f])?|\\[i])(A|a|\\0{0,4}(41|61)(\r\n|[ \t\r\n\f])?))/,/^(?:@charset )/,/^(?:(U|u|\\0{0,4}(55|75)(\r\n|[ \t\r\n\f])?|\\[u])\+([0-9a-fA-F?]{1,6}(-[0-9a-fA-F]{1,6})?))/,/^(?:([\-]?([_a-zA-Z]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))([_a-zA-Z0-9\-]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*)\()/,/^(?:([\-]?([_a-zA-Z]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))([_a-zA-Z0-9\-]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*))/,/^(?:([\-_]([0-9a-fA-F])-([0-9a-fA-F])))/,/^(?:@([\-]?([_a-zA-Z]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))([_a-zA-Z0-9\-]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*))/,/^(?:#(([_a-zA-Z0-9\-]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))+))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(E|e|\\0{0,4}(45|65)(\r\n|[ \t\r\n\f])?)(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(E|e|\\0{0,4}(45|65)(\r\n|[ \t\r\n\f])?)(X|x|\\0{0,4}(58|78)(\r\n|[ \t\r\n\f])?|\\[x]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(X|x|\\0{0,4}(58|78)(\r\n|[ \t\r\n\f])?|\\[x]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(C|c|\\0{0,4}(43|63)(\r\n|[ \t\r\n\f])?)(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m])(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(I|i|\\0{0,4}(49|69)(\r\n|[ \t\r\n\f])?|\\[i])(N|n|\\0{0,4}(4e|6e)(\r\n|[ \t\r\n\f])?|\\[n]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(T|t|\\0{0,4}(54|74)(\r\n|[ \t\r\n\f])?|\\[t]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(C|c|\\0{0,4}(43|63)(\r\n|[ \t\r\n\f])?))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(D|d|\\0{0,4}(44|64)(\r\n|[ \t\r\n\f])?)(E|e|\\0{0,4}(45|65)(\r\n|[ \t\r\n\f])?)(G|g|\\0{0,4}(47|67)(\r\n|[ \t\r\n\f])?|\\[g]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(R|r|\\0{0,4}(52|72)(\r\n|[ \t\r\n\f])?|\\[r])(A|a|\\0{0,4}(41|61)(\r\n|[ \t\r\n\f])?)(D|d|\\0{0,4}(44|64)(\r\n|[ \t\r\n\f])?))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(G|g|\\0{0,4}(47|67)(\r\n|[ \t\r\n\f])?|\\[g])(R|r|\\0{0,4}(52|72)(\r\n|[ \t\r\n\f])?|\\[r])(A|a|\\0{0,4}(41|61)(\r\n|[ \t\r\n\f])?)(D|d|\\0{0,4}(44|64)(\r\n|[ \t\r\n\f])?))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m])(S|s|\\0{0,4}(53|73)(\r\n|[ \t\r\n\f])?|\\[s]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(S|s|\\0{0,4}(53|73)(\r\n|[ \t\r\n\f])?|\\[s]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(H|h|\\0{0,4}(48|68)(\r\n|[ \t\r\n\f])?|\\[h])(Z|z|\\0{0,4}(5a|7a)(\r\n|[ \t\r\n\f])?|\\[z]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)(K|k|\\0{0,4}(4b|6b)(\r\n|[ \t\r\n\f])?|\\[k])(H|h|\\0{0,4}(48|68)(\r\n|[ \t\r\n\f])?|\\[h])(Z|z|\\0{0,4}(5a|7a)(\r\n|[ \t\r\n\f])?|\\[z]))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)([\-]?([_a-zA-Z]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))([_a-zA-Z0-9\-]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*))/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+)%)/,/^(?:([0-9]+(\.[0-9]+)?|\.[0-9]+))/,/^(?:.)/],
conditions: {"INITIAL":{"rules":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41],"inclusive":true}}
});
return lexer;
})();
parser.lexer = lexer;
function Parser () {
  this.yy = {};
}
Parser.prototype = parser;parser.Parser = Parser;
return new Parser;
})();


if (typeof require !== 'undefined' && typeof exports !== 'undefined') {
exports.parser = parser;
exports.Parser = parser.Parser;
exports.parse = function () { return parser.parse.apply(parser, arguments); };
exports.main = function commonjsMain(args) {
    if (!args[1]) {
        console.log('Usage: '+args[0]+' FILE');
        process.exit(1);
    }
    var source = require('fs').readFileSync(require('path').normalize(args[1]), "utf8");
    return exports.parser.parse(source);
};
if (typeof module !== 'undefined' && require.main === module) {
  exports.main(process.argv.slice(1));
}
}
}).call(this,require('_process'))
},{"_process":11,"fs":9,"path":10}],6:[function(require,module,exports){
(function (process){
/* parser generated by jison 0.4.15 */
/*
  Returns a Parser object of the following structure:

  Parser: {
    yy: {}
  }

  Parser.prototype: {
    yy: {},
    trace: function(),
    symbols_: {associative list: name ==> number},
    terminals_: {associative list: number ==> name},
    productions_: [...],
    performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate, $$, _$),
    table: [...],
    defaultActions: {...},
    parseError: function(str, hash),
    parse: function(input),

    lexer: {
        EOF: 1,
        parseError: function(str, hash),
        setInput: function(input),
        input: function(),
        unput: function(str),
        more: function(),
        less: function(n),
        pastInput: function(),
        upcomingInput: function(),
        showPosition: function(),
        test_match: function(regex_match_array, rule_index),
        next: function(),
        lex: function(),
        begin: function(condition),
        popState: function(),
        _currentRules: function(),
        topState: function(),
        pushState: function(condition),

        options: {
            ranges: boolean           (optional: true ==> token location info will include a .range[] member)
            flex: boolean             (optional: true ==> flex-like lexing behaviour where the rules are tested exhaustively to find the longest match)
            backtrack_lexer: boolean  (optional: true ==> lexer regexes are tested in order and for each matching regex the action code is invoked; the lexer terminates the scan when a token is returned by the action code)
        },

        performAction: function(yy, yy_, $avoiding_name_collisions, YY_START),
        rules: [...],
        conditions: {associative list: name ==> set},
    }
  }


  token location info (@$, _$, etc.): {
    first_line: n,
    last_line: n,
    first_column: n,
    last_column: n,
    range: [start_number, end_number]       (where the numbers are indexes into the input string, regular zero-based)
  }


  the parseError function receives a 'hash' object with these members for lexer and parser errors: {
    text:        (matched text)
    token:       (the produced terminal token, if any)
    line:        (yylineno)
  }
  while parser (grammar) errors will also provide these members, i.e. parser errors deliver a superset of attributes: {
    loc:         (yylloc)
    expected:    (string describing the set of expected tokens)
    recoverable: (boolean: TRUE when the parser has a error recovery rule available for this particular error)
  }
*/
var parser = (function(){
var o=function(k,v,o,l){for(o=o||{},l=k.length;l--;o[k[l]]=v);return o},$V0=[1,16,34,36,52,56,57,58,87,90,92,94,95],$V1=[1,16,34,36,52,56,57,58,87,90],$V2=[1,6],$V3=[1,7],$V4=[1,8],$V5=[1,34,36,52,56,57,58,87,90],$V6=[1,14],$V7=[1,87,90],$V8=[1,33],$V9=[1,24],$Va=[1,27],$Vb=[1,25],$Vc=[1,31],$Vd=[1,32],$Ve=[2,121],$Vf=[1,36],$Vg=[1,37],$Vh=[2,112],$Vi=[1,40],$Vj=[1,90],$Vk=[1,45],$Vl=[23,41],$Vm=[1,52],$Vn=[1,53],$Vo=[23,41,92,97,98],$Vp=[23,34,41,52,57,58,92,97,98],$Vq=[1,16,34,36,52,56,57,58,87,90,94,95],$Vr=[2,111],$Vs=[1,67],$Vt=[1,11,12,16,20,23,27,28,31,33,34,36,41,44,52,56,57,58,59,62,63,64,65,74,75,76,77,78,79,80,81,84,87,90,92,94,95,97,98,99,100],$Vu=[1,72],$Vv=[34,36,52,56,57,58],$Vw=[12,27,36,92],$Vx=[1,95],$Vy=[1,94],$Vz=[2,12],$VA=[12,36,44],$VB=[12,41],$VC=[12,23,41,92],$VD=[2,21],$VE=[1,110],$VF=[12,23,28,41],$VG=[12,44],$VH=[2,67],$VI=[1,116],$VJ=[34,36,44,52,56,57,58],$VK=[27,36],$VL=[12,23,41],$VM=[1,131],$VN=[12,23,28,41,92],$VO=[1,135],$VP=[2,70],$VQ=[11,36,92],$VR=[1,149],$VS=[1,152],$VT=[11,20,36,52,65,74,75,76,77,78,79,80,81,97,99],$VU=[1,34,36,44,52,56,57,58,87,90,94,95],$VV=[1,183],$VW=[1,185],$VX=[1,184],$VY=[1,188],$VZ=[1,189],$V_=[1,173],$V$=[1,174],$V01=[1,175],$V11=[1,176],$V21=[1,177],$V31=[1,178],$V41=[1,179],$V51=[1,180],$V61=[1,181],$V71=[1,182],$V81=[59,92],$V91=[1,87,90,94,95],$Va1=[33,34],$Vb1=[12,33,44,84],$Vc1=[1,203],$Vd1=[1,202],$Ve1=[11,12,20,23,33,36,44,52,65,74,75,76,77,78,79,80,81,84,97,99,100],$Vf1=[74,75,76,77,78,79,80,81],$Vg1=[11,12,20,23,33,36,44,52,65,74,75,76,77,78,79,80,81,84,92,97,99,100],$Vh1=[1,90,94,95];
var parser = {trace: function trace() { },
yy: {},
symbols_: {"error":2,"stylesheet":3,"charset":4,"space_cdata_list":5,"import_list":6,"ruleset_list":7,"media_list":8,"page_list":9,"CHARSET_SYM":10,"STRING":11,";":12,"import_item":13,"import":14,"cdo_cdc_space_list":15,"IMPORT_SYM":16,"space_or_empty":17,"string_or_uri":18,"media_query_list":19,"URI":20,"medium":21,"medium_list":22,",":23,"media_type":24,"expression_list":25,"media_type_prefix":26,"MEDIA_TYPE_PREFIX":27,"MEDIA_TYPE_AND":28,"at_least_one_space":29,"expression":30,"(":31,"media_feature":32,")":33,":":34,"term":35,"IDENT":36,"ruleset_item":37,"ruleset":38,"selector":39,"selector_list":40,"{":41,"declarations":42,"declaration_list":43,"}":44,"rulesets":45,"simple_selector":46,"combinator":47,"element_name":48,"simple_selector_atom_list1":49,"simple_selector_atom_list2":50,"simple_selector_atom":51,"HASH":52,"class":53,"attrib":54,"pseudo":55,"*":56,".":57,"[":58,"]":59,"attrib_operator":60,"attrib_value":61,"=":62,"INCLUDES":63,"DASHMATCH":64,"FUNCTION":65,"property":66,"expr":67,"prio":68,"term_list":69,"operator":70,"numeric_term":71,"unary_operator":72,"string_term":73,"NUMBER":74,"PERCENTAGE":75,"LENGTH":76,"EMS":77,"EXS":78,"ANGLE":79,"TIME":80,"FREQ":81,"hexcolor":82,"function":83,"IMPORTANT_SYM":84,"media_item":85,"media":86,"MEDIA_SYM":87,"page_item":88,"page":89,"PAGE_SYM":90,"pseudo_pages":91,"S":92,"space_cdata":93,"CDO":94,"CDC":95,"cdo_cdc_space_empty":96,"+":97,">":98,"-":99,"/":100,"$accept":0,"$end":1},
terminals_: {2:"error",10:"CHARSET_SYM",11:"STRING",12:";",16:"IMPORT_SYM",20:"URI",23:",",27:"MEDIA_TYPE_PREFIX",28:"MEDIA_TYPE_AND",31:"(",33:")",34:":",36:"IDENT",41:"{",44:"}",52:"HASH",56:"*",57:".",58:"[",59:"]",62:"=",63:"INCLUDES",64:"DASHMATCH",65:"FUNCTION",74:"NUMBER",75:"PERCENTAGE",76:"LENGTH",77:"EMS",78:"EXS",79:"ANGLE",80:"TIME",81:"FREQ",84:"IMPORTANT_SYM",87:"MEDIA_SYM",90:"PAGE_SYM",92:"S",94:"CDO",95:"CDC",97:"+",98:">",99:"-",100:"/"},
productions_: [0,[3,6],[4,3],[4,0],[6,1],[6,2],[6,0],[13,2],[14,7],[18,1],[18,1],[19,2],[19,0],[22,3],[22,4],[22,0],[21,3],[21,4],[26,2],[25,3],[25,4],[25,0],[30,4],[30,7],[24,2],[32,2],[7,1],[7,2],[7,0],[37,2],[38,8],[45,1],[45,2],[45,0],[40,3],[40,4],[40,0],[39,2],[39,3],[39,3],[39,4],[46,2],[46,1],[49,1],[49,2],[49,0],[50,1],[50,2],[51,1],[51,1],[51,1],[51,1],[48,1],[48,1],[53,2],[54,5],[54,9],[60,1],[60,1],[60,1],[61,1],[61,1],[55,2],[55,4],[55,6],[42,4],[42,5],[42,0],[43,3],[43,4],[43,0],[66,2],[67,2],[69,1],[69,2],[69,2],[69,3],[69,0],[35,1],[35,2],[35,1],[71,2],[71,2],[71,2],[71,2],[71,2],[71,2],[71,2],[71,2],[73,2],[73,2],[73,2],[73,2],[73,2],[68,2],[83,5],[82,2],[8,1],[8,2],[8,0],[85,2],[86,8],[9,1],[9,2],[9,0],[88,2],[89,9],[91,3],[91,0],[29,1],[29,2],[17,1],[17,0],[5,1],[5,2],[5,0],[93,1],[93,1],[93,1],[15,1],[15,2],[15,0],[96,2],[96,2],[47,2],[47,2],[72,1],[72,1],[70,2],[70,2]],
performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate /* action[1] */, $$ /* vstack */, _$ /* lstack */) {
/* this == yyval */

var $0 = $$.length - 1;
switch (yystate) {
case 1:

      this.$ = {};
      if($$[$0-5]) this.$['charset']  	= $$[$0-5];
      if($$[$0-3]) this.$['imports']  	= $$[$0-3];
      if($$[$0-2]) this.$['rulesets'] 	= $$[$0-2];
      if($$[$0-1]) this.$['medias'] 	= $$[$0-1];
      if($$[$0]) this.$['pages'] 	= $$[$0];
      return this.$;
    
break;
case 2: case 7: case 18: case 24: case 25: case 29: case 71: case 83: case 84: case 85: case 86: case 87: case 88: case 89: case 90: case 91: case 92: case 93: case 94: case 96: case 100: case 105: case 107: case 124: case 125: case 128: case 129:
this.$ = $$[$0-1];
break;
case 3: case 45: case 112:
this.$ = "";
break;
case 4: case 13: case 68:

      this.$ = [];
      if ($$[$0] !== null) this.$.push($$[$0]);
    
break;
case 5:

      this.$ = $$[$0-1];
      if ($$[$0] !== null) this.$.push($$[$0]);
    
break;
case 6: case 12: case 15: case 21: case 28: case 33: case 36: case 67: case 70: case 77: case 99: case 104: case 108: case 113: case 114: case 115: case 116: case 117: case 118: case 119: case 120: case 121: case 122: case 123:
this.$ = null;
break;
case 8:

      this.$ = {}
      if ($$[$0-4] !== null) this.$["import"] = $$[$0-4];
      if ($$[$0-2] !== null) this.$["mediaqueries"] = $$[$0-2];
    
break;
case 9: case 10: case 26: case 31: case 42: case 43: case 46: case 48: case 49: case 50: case 51: case 52: case 53: case 57: case 58: case 59: case 60: case 61: case 73: case 78: case 80: case 97: case 102: case 111: case 126: case 127:
this.$ = $$[$0];
break;
case 11:

      this.$ = [];
      if ($$[$0-1] !== null) this.$.push($$[$0-1]);
      if ($$[$0] !== null) {
        var r = this.$;
        $$[$0].forEach(function(e) { r.push(e); });
      }
    
break;
case 14:

      this.$ = [];
      if ($$[$0-3] !== null) this.$ = S1;
      if ($$[$0] !== null) this.$.push($$[$0]);
    
break;
case 16:

      this.$ = {}
      this.$.prefix = '';
      this.$.media_type = $$[$0-2];
      this.$.expression = $$[$0-1] !== null? $$[$0-1]:'';
    
break;
case 17:

      this.$ = {}
      this.$.prefix = $$[$0-3];
      this.$.media_type = $$[$0-2];
      this.$.expression = $$[$0-1] !== null? $$[$0-1]:'';
    
break;
case 19: case 34:

      this.$ = [];
      this.$.push($$[$0]);
    
break;
case 20:

      this.$ = [];
      if ($$[$0-3] !== null) this.$ = $$[$0-3];
      if ($$[$0] !== null) this.$.push($$[$0]);
    
break;
case 22:

      this.$ = {}
      this.$.media_feature = $$[$0-2];
      this.$.value = '';
    
break;
case 23:

      this.$ = {}
      this.$.media_feature = $$[$0-5];
      this.$.value = $$[$0-2];
    
break;
case 27: case 98: case 103:

      this.$ = $$[$0-1];
      var r = this.$;
      $$[$0] !== null? $$[$0].forEach(function(e) { r.push(e); }) : ''
    
break;
case 30:

      this.$ = [];
      if ($$[$0-7] !== null) {
        var s = {};
        s.selector = $$[$0-7];
        s.declaration = [];
        $$[$0-3] !== null? s.declaration.push($$[$0-3]) : '';
        $$[$0-2] !== null? $$[$0-2].forEach(function(d) { s.declaration.push(d); }) : ''
        this.$.push(s);
      }
      if ($$[$0-6] !== null) {
        var r = this.$;
        $$[$0-6].forEach(function(e) {
          var s = {};
          s.selector = e;
          s.declaration = [];
          $$[$0-3] !== null? s.declaration.push($$[$0-3]) : '';
          $$[$0-2] !== null? $$[$0-2].forEach(function(d) { s.declaration.push(d); }) : ''
          r.push(s);
        });
      }
    
break;
case 32:

      this.$ = [];
      this.$ = $$[$0-1];
      var r = this.$;
      $$[$0] !== null? $$[$0].forEach(function(e) { r.push(e); }) : ''
    
break;
case 35: case 69:

      this.$ = [];
      this.$ = $$[$0-3];
      if ($$[$0] !== null) this.$.push($$[$0]);
    
break;
case 37:
this.$ = $$[$0-1]			/* modified: the space_or_empty is not defined in the spec */;
break;
case 38:
this.$ = $$[$0-2] + $$[$0-1] + $$[$0];
break;
case 39:
this.$ = $$[$0-2] + ' ' + $$[$0];
break;
case 40:
this.$ = $$[$0-3] + $$[$0-1] + $$[$0]		/* TODO: should i add the space like above production? */;
break;
case 41: case 44: case 47: case 54: case 62: case 74: case 79:
this.$ = $$[$0-1] + $$[$0];
break;
case 55:
this.$ = $$[$0-4] + $$[$0-2] + $$[$0];
break;
case 56:
this.$ = $$[$0-8] + $$[$0-6] + $$[$0-4] + $$[$0-2] + $$[$0];
break;
case 63:
this.$ = $$[$0-3] + $$[$0-2] + $$[$0];
break;
case 64:
this.$ = $$[$0-5] + $$[$0-4] + $$[$0-2] + $$[$0];
break;
case 65:

      this.$ = {};
      this.$.key = $$[$0-3];
      this.$.value = $$[$0];
    
break;
case 66:

      this.$ = {};
      this.$.key = $$[$0-4];
      this.$.value = $$[$0-1] + ' ' + $$[$0];				/* TODO: should i need to add a space */
    
break;
case 72:

      this.$ = $$[$0-1];
      if ($$[$0] !== null) this.$ = $$[$0-1] + ' ' + $$[$0];
    
break;
case 75:
this.$ = $$[$0-1] + ' ' + $$[$0];
break;
case 76:
this.$ = $$[$0-2] + ' ' + $$[$0-1] + $$[$0];
break;
case 81: case 82:
this.$ = $$[$0-1] ;
break;
case 95:
this.$ = $$[$0-4] + $$[$0-2] + $$[$0-1];
break;
case 101:

      this.$ = {}
      if ($$[$0-5] !== null) this.$["mediaqueries"] = $$[$0-5];
      if ($$[$0-2] !== null) this.$["rulesets"] = $$[$0-2];
    
break;
case 106:

      this.$ = {};
      var s = this.$;

      $$[$0-6] !== null? this.$.pseudo_class = $$[$0-6] : '';
      this.$.declaration = [];
      $$[$0-3] !== null? this.$.declaration.push($$[$0-3]) : '';
      $$[$0-2] !== null? $$[$0-2].forEach(function(d) { s.declaration.push(d); }) : ''
    
break;
case 109: case 110:
this.$ = " ";
break;
}
},
table: [o($V0,[2,3],{3:1,4:2,10:[1,3]}),{1:[3]},o($V1,[2,115],{5:4,93:5,92:$V2,94:$V3,95:$V4}),{11:[1,9]},o($V5,[2,6],{6:10,93:11,13:12,14:13,16:$V6,92:$V2,94:$V3,95:$V4}),o($V0,[2,113]),o($V0,[2,116]),o($V0,[2,117]),o($V0,[2,118]),{12:[1,15]},o($V7,[2,28],{14:13,7:16,13:17,37:18,38:19,39:20,46:21,48:22,50:23,51:26,53:28,54:29,55:30,16:$V6,34:$V8,36:$V9,52:$Va,56:$Vb,57:$Vc,58:$Vd}),o($V0,[2,114]),o($V1,[2,4]),o($V1,$Ve,{15:34,96:35,94:$Vf,95:$Vg}),o([11,20],$Vh,{17:38,29:39,92:$Vi}),o($V0,[2,2]),o($Vj,[2,99],{38:19,39:20,46:21,48:22,50:23,51:26,53:28,54:29,55:30,8:41,37:42,85:43,86:44,34:$V8,36:$V9,52:$Va,56:$Vb,57:$Vc,58:$Vd,87:$Vk}),o($V1,[2,5]),o($V5,[2,26]),o($V5,$Ve,{96:35,15:46,94:$Vf,95:$Vg}),{23:[1,48],40:47,41:[2,36]},o($Vl,$Vh,{17:49,47:50,29:51,92:$Vi,97:$Vm,98:$Vn}),o($Vo,[2,45],{53:28,54:29,55:30,49:54,51:55,34:$V8,52:$Va,57:$Vc,58:$Vd}),o($Vo,[2,42],{53:28,54:29,55:30,51:56,34:$V8,52:$Va,57:$Vc,58:$Vd}),o($Vp,[2,52]),o($Vp,[2,53]),o($Vp,[2,46]),o($Vp,[2,48]),o($Vp,[2,49]),o($Vp,[2,50]),o($Vp,[2,51]),{36:[1,57]},{17:58,29:39,36:$Vh,92:$Vi},{36:[1,59],65:[1,60]},o($V1,[2,7],{96:61,94:$Vf,95:$Vg}),o($Vq,[2,119]),o($Vq,$Vh,{29:39,17:62,92:$Vi}),o($Vq,$Vh,{29:39,17:63,92:$Vi}),{11:[1,65],18:64,20:[1,66]},o([1,11,12,16,20,23,27,28,33,34,36,41,44,52,56,57,58,59,62,63,64,65,74,75,76,77,78,79,80,81,84,87,90,94,95,97,99,100],$Vr,{92:$Vs}),o($Vt,[2,109]),{1:[2,104],9:68,85:69,86:44,87:$Vk,88:70,89:71,90:$Vu},o($V5,[2,27]),o($V7,[2,97]),o($V7,$Ve,{96:35,15:73,94:$Vf,95:$Vg}),o([27,36,41],$Vh,{29:39,17:74,92:$Vi}),o($V5,[2,29],{96:61,94:$Vf,95:$Vg}),{23:[1,76],41:[1,75]},o($Vv,$Vh,{29:39,17:77,92:$Vi}),o($Vl,[2,37]),{34:$V8,36:$V9,39:78,46:21,48:22,50:23,51:26,52:$Va,53:28,54:29,55:30,56:$Vb,57:$Vc,58:$Vd},o($Vl,$Vr,{46:21,48:22,50:23,51:26,53:28,54:29,55:30,39:79,47:80,34:$V8,36:$V9,52:$Va,56:$Vb,57:$Vc,58:$Vd,92:$Vs,97:$Vm,98:$Vn}),o($Vv,$Vh,{29:39,17:81,92:$Vi}),o($Vv,$Vh,{29:39,17:82,92:$Vi}),o($Vo,[2,41],{53:28,54:29,55:30,51:83,34:$V8,52:$Va,57:$Vc,58:$Vd}),o($Vp,[2,43]),o($Vp,[2,47]),o($Vp,[2,54]),{36:[1,84]},o($Vp,[2,62]),o([33,36],$Vh,{29:39,17:85,92:$Vi}),o($Vq,[2,120]),o($Vq,[2,122]),o($Vq,[2,123]),o([12,27,36],$Vh,{29:39,17:86,92:$Vi}),o($Vw,[2,9]),o($Vw,[2,10]),o($Vt,[2,110]),{1:[2,1],88:87,89:71,90:$Vu},o($V7,[2,98]),o($Vj,[2,102]),o($Vj,$Ve,{96:35,15:88,94:$Vf,95:$Vg}),o([34,41],$Vh,{29:39,17:89,92:$Vi}),o($V7,[2,100],{96:61,94:$Vf,95:$Vg}),{19:90,21:91,24:92,26:93,27:$Vx,36:$Vy,41:$Vz},o($VA,$Vh,{29:39,17:96,92:$Vi}),o($Vv,$Vh,{29:39,17:97,92:$Vi}),{34:$V8,36:$V9,39:98,46:21,48:22,50:23,51:26,52:$Va,53:28,54:29,55:30,56:$Vb,57:$Vc,58:$Vd},o($Vl,[2,38]),o($Vl,[2,39]),{34:$V8,36:$V9,39:99,46:21,48:22,50:23,51:26,52:$Va,53:28,54:29,55:30,56:$Vb,57:$Vc,58:$Vd},o($Vv,[2,124]),o($Vv,[2,125]),o($Vp,[2,44]),o([59,62,63,64],$Vh,{29:39,17:100,92:$Vi}),{33:[1,101],36:[1,102]},{12:$Vz,19:103,21:91,24:92,26:93,27:$Vx,36:$Vy},o($Vj,[2,103]),o($Vj,[2,105],{96:61,94:$Vf,95:$Vg}),{34:[1,105],41:[2,108],91:104},{41:[1,106]},o($VB,[2,15],{22:107,23:[1,108]}),o($VC,$VD,{25:109,28:$VE}),{24:111,36:$Vy},o($VF,$Vh,{29:39,17:112,92:$Vi}),{17:113,29:39,36:$Vh,92:$Vi},o($VG,$VH,{42:114,66:115,36:$VI}),{34:$V8,36:$V9,39:117,46:21,48:22,50:23,51:26,52:$Va,53:28,54:29,55:30,56:$Vb,57:$Vc,58:$Vd},o($Vl,[2,34]),o($Vl,[2,40]),{59:[1,118],60:119,62:[1,120],63:[1,121],64:[1,122]},o($Vp,[2,63]),{17:123,29:39,33:$Vh,92:$Vi},{12:[1,124]},{41:[1,125]},{36:[1,126]},o($VJ,$Vh,{29:39,17:127,92:$Vi}),o($VB,[2,11],{23:[1,128]}),o($VK,$Vh,{29:39,17:129,92:$Vi}),o($VL,$Vh,{29:39,17:130,28:$VM,92:$Vi}),{29:132,92:$Vi},o($VC,$VD,{25:133,28:$VE}),o($VN,[2,24]),{36:[2,18]},{12:$VO,43:134,44:$VP},{34:[1,136]},{17:137,29:39,34:$Vh,92:$Vi},o($Vl,[2,35]),o($Vp,[2,55]),o([11,36],$Vh,{29:39,17:138,92:$Vi}),o($VQ,[2,57]),o($VQ,[2,58]),o($VQ,[2,59]),{33:[1,139]},o($Vq,$Vh,{29:39,17:140,92:$Vi}),o($VA,$Vh,{29:39,17:141,92:$Vi}),{17:142,29:39,41:$Vh,92:$Vi},{34:$V8,36:$V9,38:144,39:20,44:[2,33],45:143,46:21,48:22,50:23,51:26,52:$Va,53:28,54:29,55:30,56:$Vb,57:$Vc,58:$Vd},o($VK,$Vh,{29:39,17:145,92:$Vi}),{21:146,24:92,26:93,27:$Vx,36:$Vy},o($VL,[2,16]),{29:147,92:$Vi},{30:148,31:$VR,92:$Vs},o($VL,$Vh,{29:39,17:150,28:$VM,92:$Vi}),{12:$VS,44:[1,151]},o($VA,$Vh,{29:39,17:153,92:$Vi}),o($VT,$Vh,{29:39,17:154,92:$Vi}),{34:[2,71]},{11:[1,157],36:[1,156],61:155},o($Vp,[2,64]),o($Vq,[2,8]),o($VG,$VH,{66:115,42:158,36:$VI}),{41:[2,107]},{34:$V8,36:$V9,38:160,39:20,44:[1,159],46:21,48:22,50:23,51:26,52:$Va,53:28,54:29,55:30,56:$Vb,57:$Vc,58:$Vd},o($VJ,[2,31]),{21:161,24:92,26:93,27:$Vx,36:$Vy},o($VL,[2,13]),{30:162,31:$VR,92:$Vs},o($VN,[2,19]),{32:163,36:[1,164]},o($VL,[2,17]),o($VU,$Vh,{29:39,17:165,92:$Vi}),o($VA,$Vh,{29:39,17:166,92:$Vi}),o($VG,$VH,{66:115,42:167,36:$VI}),{11:$VV,20:$VW,35:169,36:$VX,52:$VY,65:$VZ,67:168,71:170,72:171,73:172,74:$V_,75:$V$,76:$V01,77:$V11,78:$V21,79:$V31,80:$V41,81:$V51,82:186,83:187,97:$V61,99:$V71},{17:190,29:39,59:$Vh,92:$Vi},o($V81,[2,60]),o($V81,[2,61]),{12:$VO,43:191,44:$VP},o($V91,$Vh,{29:39,17:192,92:$Vi}),o($VJ,[2,32]),o($VL,[2,14]),o($VN,[2,20]),{33:[1,193],34:[1,194]},o($Va1,$Vh,{29:39,17:195,92:$Vi}),o($VU,[2,30]),o($VG,$VH,{66:115,42:196,36:$VI}),o($VG,[2,68]),o($VG,[2,65],{68:197,84:[1,198]}),o($Vb1,[2,77],{71:170,72:171,73:172,82:186,83:187,69:199,35:200,70:201,11:$VV,20:$VW,23:$Vc1,36:$VX,52:$VY,65:$VZ,74:$V_,75:$V$,76:$V01,77:$V11,78:$V21,79:$V31,80:$V41,81:$V51,97:$V61,99:$V71,100:$Vd1}),o($Ve1,[2,78]),{71:204,74:$V_,75:$V$,76:$V01,77:$V11,78:$V21,79:$V31,80:$V41,81:$V51},o($Ve1,[2,80]),o($Ve1,$Vh,{29:39,17:205,92:$Vi}),o($Ve1,$Vh,{29:39,17:206,92:$Vi}),o($Ve1,$Vh,{29:39,17:207,92:$Vi}),o($Ve1,$Vh,{29:39,17:208,92:$Vi}),o($Ve1,$Vh,{29:39,17:209,92:$Vi}),o($Ve1,$Vh,{29:39,17:210,92:$Vi}),o($Ve1,$Vh,{29:39,17:211,92:$Vi}),o($Ve1,$Vh,{29:39,17:212,92:$Vi}),o($Vf1,[2,126]),o($Vf1,[2,127]),o($Ve1,$Vh,{29:39,17:213,92:$Vi}),o($Ve1,$Vh,{29:39,17:214,92:$Vi}),o($Ve1,$Vh,{29:39,17:215,92:$Vi}),o($Ve1,$Vh,{29:39,17:216,92:$Vi}),o($Ve1,$Vh,{29:39,17:217,92:$Vi}),o($Ve1,$Vh,{29:39,17:218,92:$Vi}),o($VT,$Vh,{29:39,17:219,92:$Vi}),{59:[1,220]},{12:$VS,44:[1,221]},o($V91,[2,101]),o($VF,$Vh,{29:39,17:222,92:$Vi}),o($VT,$Vh,{29:39,17:223,92:$Vi}),o($Va1,[2,25]),o($VG,[2,69]),o($VG,[2,66]),o($VG,$Vh,{29:39,17:224,92:$Vi}),o($Vb1,[2,72],{71:170,72:171,73:172,82:186,83:187,35:225,70:226,11:$VV,20:$VW,23:$Vc1,36:$VX,52:$VY,65:$VZ,74:$V_,75:$V$,76:$V01,77:$V11,78:$V21,79:$V31,80:$V41,81:$V51,97:$V61,99:$V71,100:$Vd1}),o($Ve1,[2,73]),{11:$VV,20:$VW,35:227,36:$VX,52:$VY,65:$VZ,71:170,72:171,73:172,74:$V_,75:$V$,76:$V01,77:$V11,78:$V21,79:$V31,80:$V41,81:$V51,82:186,83:187,97:$V61,99:$V71},o($VT,$Vh,{29:39,17:228,92:$Vi}),o($VT,$Vh,{29:39,17:229,92:$Vi}),o($Ve1,[2,79]),o($Ve1,[2,81]),o($Ve1,[2,82]),o($Ve1,[2,83]),o($Ve1,[2,84]),o($Ve1,[2,85]),o($Ve1,[2,86]),o($Ve1,[2,87]),o($Ve1,[2,88]),o($Ve1,[2,89]),o($Ve1,[2,90]),o($Ve1,[2,91]),o($Ve1,[2,92]),o($Ve1,[2,93]),o($Vg1,[2,96]),{11:$VV,20:$VW,35:169,36:$VX,52:$VY,65:$VZ,67:230,71:170,72:171,73:172,74:$V_,75:$V$,76:$V01,77:$V11,78:$V21,79:$V31,80:$V41,81:$V51,82:186,83:187,97:$V61,99:$V71},o($Vp,[2,56]),o($Vh1,$Vh,{29:39,17:231,92:$Vi}),o($VN,[2,22]),{11:$VV,20:$VW,35:232,36:$VX,52:$VY,65:$VZ,71:170,72:171,73:172,74:$V_,75:$V$,76:$V01,77:$V11,78:$V21,79:$V31,80:$V41,81:$V51,82:186,83:187,97:$V61,99:$V71},o($VG,[2,94]),o($Ve1,[2,75]),{11:$VV,20:$VW,35:233,36:$VX,52:$VY,65:$VZ,71:170,72:171,73:172,74:$V_,75:$V$,76:$V01,77:$V11,78:$V21,79:$V31,80:$V41,81:$V51,82:186,83:187,97:$V61,99:$V71},o($Ve1,[2,74]),o($VT,[2,128]),o($VT,[2,129]),{33:[1,234]},o($Vh1,[2,106]),{33:[1,235]},o($Ve1,[2,76]),o($Ve1,$Vh,{29:39,17:236,92:$Vi}),o($VF,$Vh,{29:39,17:237,92:$Vi}),o($Vg1,[2,95]),o($VN,[2,23])],
defaultActions: {113:[2,18],137:[2,71],142:[2,107]},
parseError: function parseError(str, hash) {
    if (hash.recoverable) {
        this.trace(str);
    } else {
        throw new Error(str);
    }
},
parse: function parse(input) {
    var self = this, stack = [0], tstack = [], vstack = [null], lstack = [], table = this.table, yytext = '', yylineno = 0, yyleng = 0, recovering = 0, TERROR = 2, EOF = 1;
    var args = lstack.slice.call(arguments, 1);
    var lexer = Object.create(this.lexer);
    var sharedState = { yy: {} };
    for (var k in this.yy) {
        if (Object.prototype.hasOwnProperty.call(this.yy, k)) {
            sharedState.yy[k] = this.yy[k];
        }
    }
    lexer.setInput(input, sharedState.yy);
    sharedState.yy.lexer = lexer;
    sharedState.yy.parser = this;
    if (typeof lexer.yylloc == 'undefined') {
        lexer.yylloc = {};
    }
    var yyloc = lexer.yylloc;
    lstack.push(yyloc);
    var ranges = lexer.options && lexer.options.ranges;
    if (typeof sharedState.yy.parseError === 'function') {
        this.parseError = sharedState.yy.parseError;
    } else {
        this.parseError = Object.getPrototypeOf(this).parseError;
    }
    function popStack(n) {
        stack.length = stack.length - 2 * n;
        vstack.length = vstack.length - n;
        lstack.length = lstack.length - n;
    }
    _token_stack:
        function lex() {
            var token;
            token = lexer.lex() || EOF;
            if (typeof token !== 'number') {
                token = self.symbols_[token] || token;
            }
            return token;
        }
    var symbol, preErrorSymbol, state, action, a, r, yyval = {}, p, len, newState, expected;
    while (true) {
        state = stack[stack.length - 1];
        if (this.defaultActions[state]) {
            action = this.defaultActions[state];
        } else {
            if (symbol === null || typeof symbol == 'undefined') {
                symbol = lex();
            }
            action = table[state] && table[state][symbol];
        }
                    if (typeof action === 'undefined' || !action.length || !action[0]) {
                var errStr = '';
                expected = [];
                for (p in table[state]) {
                    if (this.terminals_[p] && p > TERROR) {
                        expected.push('\'' + this.terminals_[p] + '\'');
                    }
                }
                if (lexer.showPosition) {
                    errStr = 'Parse error on line ' + (yylineno + 1) + ':\n' + lexer.showPosition() + '\nExpecting ' + expected.join(', ') + ', got \'' + (this.terminals_[symbol] || symbol) + '\'';
                } else {
                    errStr = 'Parse error on line ' + (yylineno + 1) + ': Unexpected ' + (symbol == EOF ? 'end of input' : '\'' + (this.terminals_[symbol] || symbol) + '\'');
                }
                this.parseError(errStr, {
                    text: lexer.match,
                    token: this.terminals_[symbol] || symbol,
                    line: lexer.yylineno,
                    loc: yyloc,
                    expected: expected
                });
            }
        if (action[0] instanceof Array && action.length > 1) {
            throw new Error('Parse Error: multiple actions possible at state: ' + state + ', token: ' + symbol);
        }
        switch (action[0]) {
        case 1:
            stack.push(symbol);
            vstack.push(lexer.yytext);
            lstack.push(lexer.yylloc);
            stack.push(action[1]);
            symbol = null;
            if (!preErrorSymbol) {
                yyleng = lexer.yyleng;
                yytext = lexer.yytext;
                yylineno = lexer.yylineno;
                yyloc = lexer.yylloc;
                if (recovering > 0) {
                    recovering--;
                }
            } else {
                symbol = preErrorSymbol;
                preErrorSymbol = null;
            }
            break;
        case 2:
            len = this.productions_[action[1]][1];
            yyval.$ = vstack[vstack.length - len];
            yyval._$ = {
                first_line: lstack[lstack.length - (len || 1)].first_line,
                last_line: lstack[lstack.length - 1].last_line,
                first_column: lstack[lstack.length - (len || 1)].first_column,
                last_column: lstack[lstack.length - 1].last_column
            };
            if (ranges) {
                yyval._$.range = [
                    lstack[lstack.length - (len || 1)].range[0],
                    lstack[lstack.length - 1].range[1]
                ];
            }
            r = this.performAction.apply(yyval, [
                yytext,
                yyleng,
                yylineno,
                sharedState.yy,
                action[1],
                vstack,
                lstack
            ].concat(args));
            if (typeof r !== 'undefined') {
                return r;
            }
            if (len) {
                stack = stack.slice(0, -1 * len * 2);
                vstack = vstack.slice(0, -1 * len);
                lstack = lstack.slice(0, -1 * len);
            }
            stack.push(this.productions_[action[1]][0]);
            vstack.push(yyval.$);
            lstack.push(yyval._$);
            newState = table[stack[stack.length - 2]][stack[stack.length - 1]];
            stack.push(newState);
            break;
        case 3:
            return true;
        }
    }
    return true;
}};
/* generated by jison-lex 0.3.4 */
var lexer = (function(){
var lexer = ({

EOF:1,

parseError:function parseError(str, hash) {
        if (this.yy.parser) {
            this.yy.parser.parseError(str, hash);
        } else {
            throw new Error(str);
        }
    },

// resets the lexer, sets new input
setInput:function (input, yy) {
        this.yy = yy || this.yy || {};
        this._input = input;
        this._more = this._backtrack = this.done = false;
        this.yylineno = this.yyleng = 0;
        this.yytext = this.matched = this.match = '';
        this.conditionStack = ['INITIAL'];
        this.yylloc = {
            first_line: 1,
            first_column: 0,
            last_line: 1,
            last_column: 0
        };
        if (this.options.ranges) {
            this.yylloc.range = [0,0];
        }
        this.offset = 0;
        return this;
    },

// consumes and returns one char from the input
input:function () {
        var ch = this._input[0];
        this.yytext += ch;
        this.yyleng++;
        this.offset++;
        this.match += ch;
        this.matched += ch;
        var lines = ch.match(/(?:\r\n?|\n).*/g);
        if (lines) {
            this.yylineno++;
            this.yylloc.last_line++;
        } else {
            this.yylloc.last_column++;
        }
        if (this.options.ranges) {
            this.yylloc.range[1]++;
        }

        this._input = this._input.slice(1);
        return ch;
    },

// unshifts one char (or a string) into the input
unput:function (ch) {
        var len = ch.length;
        var lines = ch.split(/(?:\r\n?|\n)/g);

        this._input = ch + this._input;
        this.yytext = this.yytext.substr(0, this.yytext.length - len);
        //this.yyleng -= len;
        this.offset -= len;
        var oldLines = this.match.split(/(?:\r\n?|\n)/g);
        this.match = this.match.substr(0, this.match.length - 1);
        this.matched = this.matched.substr(0, this.matched.length - 1);

        if (lines.length - 1) {
            this.yylineno -= lines.length - 1;
        }
        var r = this.yylloc.range;

        this.yylloc = {
            first_line: this.yylloc.first_line,
            last_line: this.yylineno + 1,
            first_column: this.yylloc.first_column,
            last_column: lines ?
                (lines.length === oldLines.length ? this.yylloc.first_column : 0)
                 + oldLines[oldLines.length - lines.length].length - lines[0].length :
              this.yylloc.first_column - len
        };

        if (this.options.ranges) {
            this.yylloc.range = [r[0], r[0] + this.yyleng - len];
        }
        this.yyleng = this.yytext.length;
        return this;
    },

// When called from action, caches matched text and appends it on next action
more:function () {
        this._more = true;
        return this;
    },

// When called from action, signals the lexer that this rule fails to match the input, so the next matching rule (regex) should be tested instead.
reject:function () {
        if (this.options.backtrack_lexer) {
            this._backtrack = true;
        } else {
            return this.parseError('Lexical error on line ' + (this.yylineno + 1) + '. You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).\n' + this.showPosition(), {
                text: "",
                token: null,
                line: this.yylineno
            });

        }
        return this;
    },

// retain first n characters of the match
less:function (n) {
        this.unput(this.match.slice(n));
    },

// displays already matched input, i.e. for error messages
pastInput:function () {
        var past = this.matched.substr(0, this.matched.length - this.match.length);
        return (past.length > 20 ? '...':'') + past.substr(-20).replace(/\n/g, "");
    },

// displays upcoming input, i.e. for error messages
upcomingInput:function () {
        var next = this.match;
        if (next.length < 20) {
            next += this._input.substr(0, 20-next.length);
        }
        return (next.substr(0,20) + (next.length > 20 ? '...' : '')).replace(/\n/g, "");
    },

// displays the character position where the lexing error occurred, i.e. for error messages
showPosition:function () {
        var pre = this.pastInput();
        var c = new Array(pre.length + 1).join("-");
        return pre + this.upcomingInput() + "\n" + c + "^";
    },

// test the lexed token: return FALSE when not a match, otherwise return token
test_match:function (match, indexed_rule) {
        var token,
            lines,
            backup;

        if (this.options.backtrack_lexer) {
            // save context
            backup = {
                yylineno: this.yylineno,
                yylloc: {
                    first_line: this.yylloc.first_line,
                    last_line: this.last_line,
                    first_column: this.yylloc.first_column,
                    last_column: this.yylloc.last_column
                },
                yytext: this.yytext,
                match: this.match,
                matches: this.matches,
                matched: this.matched,
                yyleng: this.yyleng,
                offset: this.offset,
                _more: this._more,
                _input: this._input,
                yy: this.yy,
                conditionStack: this.conditionStack.slice(0),
                done: this.done
            };
            if (this.options.ranges) {
                backup.yylloc.range = this.yylloc.range.slice(0);
            }
        }

        lines = match[0].match(/(?:\r\n?|\n).*/g);
        if (lines) {
            this.yylineno += lines.length;
        }
        this.yylloc = {
            first_line: this.yylloc.last_line,
            last_line: this.yylineno + 1,
            first_column: this.yylloc.last_column,
            last_column: lines ?
                         lines[lines.length - 1].length - lines[lines.length - 1].match(/\r?\n?/)[0].length :
                         this.yylloc.last_column + match[0].length
        };
        this.yytext += match[0];
        this.match += match[0];
        this.matches = match;
        this.yyleng = this.yytext.length;
        if (this.options.ranges) {
            this.yylloc.range = [this.offset, this.offset += this.yyleng];
        }
        this._more = false;
        this._backtrack = false;
        this._input = this._input.slice(match[0].length);
        this.matched += match[0];
        token = this.performAction.call(this, this.yy, this, indexed_rule, this.conditionStack[this.conditionStack.length - 1]);
        if (this.done && this._input) {
            this.done = false;
        }
        if (token) {
            return token;
        } else if (this._backtrack) {
            // recover context
            for (var k in backup) {
                this[k] = backup[k];
            }
            return false; // rule action called reject() implying the next rule should be tested instead.
        }
        return false;
    },

// return next match in input
next:function () {
        if (this.done) {
            return this.EOF;
        }
        if (!this._input) {
            this.done = true;
        }

        var token,
            match,
            tempMatch,
            index;
        if (!this._more) {
            this.yytext = '';
            this.match = '';
        }
        var rules = this._currentRules();
        for (var i = 0; i < rules.length; i++) {
            tempMatch = this._input.match(this.rules[rules[i]]);
            if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
                match = tempMatch;
                index = i;
                if (this.options.backtrack_lexer) {
                    token = this.test_match(tempMatch, rules[i]);
                    if (token !== false) {
                        return token;
                    } else if (this._backtrack) {
                        match = false;
                        continue; // rule action called reject() implying a rule MISmatch.
                    } else {
                        // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
                        return false;
                    }
                } else if (!this.options.flex) {
                    break;
                }
            }
        }
        if (match) {
            token = this.test_match(match, rules[index]);
            if (token !== false) {
                return token;
            }
            // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
            return false;
        }
        if (this._input === "") {
            return this.EOF;
        } else {
            return this.parseError('Lexical error on line ' + (this.yylineno + 1) + '. Unrecognized text.\n' + this.showPosition(), {
                text: "",
                token: null,
                line: this.yylineno
            });
        }
    },

// return next match that has a token
lex:function lex() {
        var r = this.next();
        if (r) {
            return r;
        } else {
            return this.lex();
        }
    },

// activates a new lexer condition state (pushes the new lexer condition state onto the condition stack)
begin:function begin(condition) {
        this.conditionStack.push(condition);
    },

// pop the previously active lexer condition state off the condition stack
popState:function popState() {
        var n = this.conditionStack.length - 1;
        if (n > 0) {
            return this.conditionStack.pop();
        } else {
            return this.conditionStack[0];
        }
    },

// produce the lexer rule set which is active for the currently active lexer condition state
_currentRules:function _currentRules() {
        if (this.conditionStack.length && this.conditionStack[this.conditionStack.length - 1]) {
            return this.conditions[this.conditionStack[this.conditionStack.length - 1]].rules;
        } else {
            return this.conditions["INITIAL"].rules;
        }
    },

// return the currently active lexer condition state; when an index argument is provided it produces the N-th previous condition state, if available
topState:function topState(n) {
        n = this.conditionStack.length - 1 - Math.abs(n || 0);
        if (n >= 0) {
            return this.conditionStack[n];
        } else {
            return "INITIAL";
        }
    },

// alias for begin(condition)
pushState:function pushState(condition) {
        this.begin(condition);
    },

// return the number of states currently on the stack
stateStackSize:function stateStackSize() {
        return this.conditionStack.length;
    },
options: {},
performAction: function anonymous(yy,yy_,$avoiding_name_collisions,YY_START) {
var YYSTATE=YY_START;
switch($avoiding_name_collisions) {
case 0:return 92;
break;
case 1:
break;
case 2:
break;
case 3:return 94;
break;
case 4:return 95;
break;
case 5:return 63;
break;
case 6:return 64;
break;
case 7:return 'PREFIXMATCH';
break;
case 8:return 'SUFFIXMATCH';
break;
case 9:return 'SUBSTRINGMATCH';
break;
case 10:return 'COLUMN';
break;
case 11:return 11;
break;
case 12:return 'BAD_STRING';
break;
case 13:return 20;
break;
case 14:return 20;
break;
case 15:return 'BAD_URI';
break;
case 16:return 84;
break;
case 17:return 16;
break;
case 18:return 90;
break;
case 19:return 87;
break;
case 20:return 10;
break;
case 21:return 'UNICODERANGE';
break;
case 22:return 27;
break;
case 23:return 27;
break;
case 24:return 28;
break;
case 25:return 65;
break;
case 26:return 36;
break;
case 27:return 'VENDOR';
break;
case 28:return 'ATKEYWORD';
break;
case 29:return 52;
break;
case 30:return 77;
break;
case 31:return 78;
break;
case 32:return 76;
break;
case 33:return 76;
break;
case 34:return 76;
break;
case 35:return 76;
break;
case 36:return 76;
break;
case 37:return 76;
break;
case 38:return 79;
break;
case 39:return 79;
break;
case 40:return 79;
break;
case 41:return 80;
break;
case 42:return 80;
break;
case 43:return 81;
break;
case 44:return 81;
break;
case 45:return 75;
break;
case 46:return 74;
break;
case 47:return 'DIMENSION';
break;
case 48:return yy_.yytext; /* 'DELIM'; */
break;
}
},
rules: [/^(?:([ \t\r\n\f]+))/,/^(?:\/\*[^*]*\*+([^/*][^*]*\*+)*\/)/,/^(?:((\/\*[^*]*\*+([^/*][^*]*\*+)*)|(\/\*[^*]*(\*+[^/*][^*]*)*)))/,/^(?:<!--)/,/^(?:-->)/,/^(?:~=)/,/^(?:\|=)/,/^(?:\^=)/,/^(?:\$=)/,/^(?:\*=)/,/^(?:\|\|)/,/^(?:(("([^\n\r\f\\"]|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*")|('([^\n\r\f\\']|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*')))/,/^(?:(("([^\n\r\f\\"]|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*\\?)|('([^\n\r\f\\']|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*\\?)))/,/^(?:url\((([ \t\r\n\f]+)?)(("([^\n\r\f\\"]|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*")|('([^\n\r\f\\']|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*'))(([ \t\r\n\f]+)?)\))/,/^(?:url\((([ \t\r\n\f]+)?)(([!#$%&*-~]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*)(([ \t\r\n\f]+)?)\))/,/^(?:((url\((([ \t\r\n\f]+)?)([!#$%&*-\[\]-~]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*(([ \t\r\n\f]+)?))|(url\((([ \t\r\n\f]+)?)(("([^\n\r\f\\"]|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*")|('([^\n\r\f\\']|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*'))(([ \t\r\n\f]+)?))|(url\((([ \t\r\n\f]+)?)(("([^\n\r\f\\"]|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*\\?)|('([^\n\r\f\\']|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*\\?)))))/,/^(?:!((([ \t\r\n\f]+)?)|(\/\*[^*]*\*+([^/*][^*]*\*+)*\/))*(I|i|\\0{0,4}(49|69)(\r\n|[ \t\r\n\f])?|\\[i])(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m])(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(O|o|\\0{0,4}(4f|6f)(\r\n|[ \t\r\n\f])?|\\[o])(R|r|\\0{0,4}(52|72)(\r\n|[ \t\r\n\f])?|\\[r])(T|t|\\0{0,4}(54|74)(\r\n|[ \t\r\n\f])?|\\[t])(A|a|\\0{0,4}(41|61)(\r\n|[ \t\r\n\f])?)(N|n|\\0{0,4}(4e|6e)(\r\n|[ \t\r\n\f])?|\\[n])(T|t|\\0{0,4}(54|74)(\r\n|[ \t\r\n\f])?|\\[t]))/,/^(?:@(I|i|\\0{0,4}(49|69)(\r\n|[ \t\r\n\f])?|\\[i])(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m])(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(O|o|\\0{0,4}(4f|6f)(\r\n|[ \t\r\n\f])?|\\[o])(R|r|\\0{0,4}(52|72)(\r\n|[ \t\r\n\f])?|\\[r])(T|t|\\0{0,4}(54|74)(\r\n|[ \t\r\n\f])?|\\[t]))/,/^(?:@(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(A|a|\\0{0,4}(41|61)(\r\n|[ \t\r\n\f])?)(G|g|\\0{0,4}(47|67)(\r\n|[ \t\r\n\f])?|\\[g])(E|e|\\0{0,4}(45|65)(\r\n|[ \t\r\n\f])?))/,/^(?:@(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m])(E|e|\\0{0,4}(45|65)(\r\n|[ \t\r\n\f])?)(D|d|\\0{0,4}(44|64)(\r\n|[ \t\r\n\f])?)(I|i|\\0{0,4}(49|69)(\r\n|[ \t\r\n\f])?|\\[i])(A|a|\\0{0,4}(41|61)(\r\n|[ \t\r\n\f])?))/,/^(?:@charset )/,/^(?:(U|u|\\0{0,4}(55|75)(\r\n|[ \t\r\n\f])?|\\[u])\+([0-9a-fA-F?]{1,6}(-[0-9a-fA-F]{1,6})?))/,/^(?:only\b)/,/^(?:not\b)/,/^(?:and\b)/,/^(?:([\-]?([_a-zA-Z]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))([_a-zA-Z0-9\-]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*)\()/,/^(?:([\-]?([_a-zA-Z]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))([_a-zA-Z0-9\-]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*))/,/^(?:([\-_]([0-9a-fA-F])-([0-9a-fA-F])))/,/^(?:@([\-]?([_a-zA-Z]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))([_a-zA-Z0-9\-]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*))/,/^(?:#(([_a-zA-Z0-9\-]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))+))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9]+)?|\.[0-9]+([eE][+\-][0-9]+)?)(E|e|\\0{0,4}(45|65)(\r\n|[ \t\r\n\f])?)(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9]+)?|\.[0-9]+([eE][+\-][0-9]+)?)(E|e|\\0{0,4}(45|65)(\r\n|[ \t\r\n\f])?)(X|x|\\0{0,4}(58|78)(\r\n|[ \t\r\n\f])?|\\[x]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9]+)?|\.[0-9]+([eE][+\-][0-9]+)?)(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(X|x|\\0{0,4}(58|78)(\r\n|[ \t\r\n\f])?|\\[x]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9]+)?|\.[0-9]+([eE][+\-][0-9]+)?)(C|c|\\0{0,4}(43|63)(\r\n|[ \t\r\n\f])?)(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9]+)?|\.[0-9]+([eE][+\-][0-9]+)?)(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m])(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9]+)?|\.[0-9]+([eE][+\-][0-9]+)?)(I|i|\\0{0,4}(49|69)(\r\n|[ \t\r\n\f])?|\\[i])(N|n|\\0{0,4}(4e|6e)(\r\n|[ \t\r\n\f])?|\\[n]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9]+)?|\.[0-9]+([eE][+\-][0-9]+)?)(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(T|t|\\0{0,4}(54|74)(\r\n|[ \t\r\n\f])?|\\[t]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9]+)?|\.[0-9]+([eE][+\-][0-9]+)?)(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(C|c|\\0{0,4}(43|63)(\r\n|[ \t\r\n\f])?))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9]+)?|\.[0-9]+([eE][+\-][0-9]+)?)(D|d|\\0{0,4}(44|64)(\r\n|[ \t\r\n\f])?)(E|e|\\0{0,4}(45|65)(\r\n|[ \t\r\n\f])?)(G|g|\\0{0,4}(47|67)(\r\n|[ \t\r\n\f])?|\\[g]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9]+)?|\.[0-9]+([eE][+\-][0-9]+)?)(R|r|\\0{0,4}(52|72)(\r\n|[ \t\r\n\f])?|\\[r])(A|a|\\0{0,4}(41|61)(\r\n|[ \t\r\n\f])?)(D|d|\\0{0,4}(44|64)(\r\n|[ \t\r\n\f])?))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9]+)?|\.[0-9]+([eE][+\-][0-9]+)?)(G|g|\\0{0,4}(47|67)(\r\n|[ \t\r\n\f])?|\\[g])(R|r|\\0{0,4}(52|72)(\r\n|[ \t\r\n\f])?|\\[r])(A|a|\\0{0,4}(41|61)(\r\n|[ \t\r\n\f])?)(D|d|\\0{0,4}(44|64)(\r\n|[ \t\r\n\f])?))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9]+)?|\.[0-9]+([eE][+\-][0-9]+)?)(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m])(S|s|\\0{0,4}(53|73)(\r\n|[ \t\r\n\f])?|\\[s]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9]+)?|\.[0-9]+([eE][+\-][0-9]+)?)(S|s|\\0{0,4}(53|73)(\r\n|[ \t\r\n\f])?|\\[s]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9]+)?|\.[0-9]+([eE][+\-][0-9]+)?)(H|h|\\0{0,4}(48|68)(\r\n|[ \t\r\n\f])?|\\[h])(Z|z|\\0{0,4}(5a|7a)(\r\n|[ \t\r\n\f])?|\\[z]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9]+)?|\.[0-9]+([eE][+\-][0-9]+)?)(K|k|\\0{0,4}(4b|6b)(\r\n|[ \t\r\n\f])?|\\[k])(H|h|\\0{0,4}(48|68)(\r\n|[ \t\r\n\f])?|\\[h])(Z|z|\\0{0,4}(5a|7a)(\r\n|[ \t\r\n\f])?|\\[z]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9]+)?|\.[0-9]+([eE][+\-][0-9]+)?)%)/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9]+)?|\.[0-9]+([eE][+\-][0-9]+)?))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9]+)?|\.[0-9]+([eE][+\-][0-9]+)?)([\-]?([_a-zA-Z]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))([_a-zA-Z0-9\-]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*))/,/^(?:.)/],
conditions: {"INITIAL":{"rules":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48],"inclusive":true}}
});
return lexer;
})();
parser.lexer = lexer;
function Parser () {
  this.yy = {};
}
Parser.prototype = parser;parser.Parser = Parser;
return new Parser;
})();


if (typeof require !== 'undefined' && typeof exports !== 'undefined') {
exports.parser = parser;
exports.Parser = parser.Parser;
exports.parse = function () { return parser.parse.apply(parser, arguments); };
exports.main = function commonjsMain(args) {
    if (!args[1]) {
        console.log('Usage: '+args[0]+' FILE');
        process.exit(1);
    }
    var source = require('fs').readFileSync(require('path').normalize(args[1]), "utf8");
    return exports.parser.parse(source);
};
if (typeof module !== 'undefined' && require.main === module) {
  exports.main(process.argv.slice(1));
}
}
}).call(this,require('_process'))
},{"_process":11,"fs":9,"path":10}],7:[function(require,module,exports){
/*
Copyright (c) 2015, Yahoo Inc. All rights reserved.
Copyrights licensed under the New BSD License.
See the accompanying LICENSE file for terms.

Authors: Nera Liu <neraliu@yahoo-inc.com, neraliu@gmail.com>
*/
(function() {
"use strict";

var cssParser21 = require('./css-parser.21.js');
var cssParser21Core = require('./css-parser.21.core.js');
var cssStringParser21 = require('./css-parser.21.attr.js');
var cssStrictStringParser = require('./css-parser.strict.attr.js');

var cssParser3 = require('./css-parser.3.js');

function CSSParser(config) {
    config = config || {};
    
    this.cssParser = null;
    this.cssStringParser = null;

    config.ver === "2.1"? this.cssParser = cssParser21 : '';
    config.ver === "2.1-core"? this.cssParser = cssParser21Core : '';

    config.ver === "2.1"? this.cssStringParser = cssStringParser21 : '';

    config.ver === "3"? this.cssParser = cssParser3 : '';
    config.ver === "3"? this.cssStringParser = cssStringParser21 : '';

    config.ver === "strict"? this.cssParser = '' : ''; // TODO: need to implement
    config.ver === "strict"? this.cssStringParser = cssStrictStringParser : '';

    this.cssParser === null? this.cssParser = cssParser21 : '';
    this.cssStringParser === null? this.cssStringParser = cssStringParser21 : '';

    this.throwError = config.throwError !== undefined? config.throwError : true;
}

CSSParser.prototype.parse = function(str) {
    var ast = {};
    try {
        ast = this.cssParser.parse(str);
    } catch (err) {
        if (this.throwError) {
            throw err;
        } else {
            return false;
        }
    }
    return ast;
};

CSSParser.prototype.parseCssString = function(str) {
    var ast = {};
    try {
        ast = this.cssStringParser.parse(str);
    } catch (err) {
        if (this.throwError) {
            throw err;
        } else {
            return false;
        }
    }
    return ast;
};

module.exports = CSSParser;

})();

},{"./css-parser.21.attr.js":3,"./css-parser.21.core.js":4,"./css-parser.21.js":5,"./css-parser.3.js":6,"./css-parser.strict.attr.js":8}],8:[function(require,module,exports){
(function (process){
/* parser generated by jison 0.4.15 */
/*
  Returns a Parser object of the following structure:

  Parser: {
    yy: {}
  }

  Parser.prototype: {
    yy: {},
    trace: function(),
    symbols_: {associative list: name ==> number},
    terminals_: {associative list: number ==> name},
    productions_: [...],
    performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate, $$, _$),
    table: [...],
    defaultActions: {...},
    parseError: function(str, hash),
    parse: function(input),

    lexer: {
        EOF: 1,
        parseError: function(str, hash),
        setInput: function(input),
        input: function(),
        unput: function(str),
        more: function(),
        less: function(n),
        pastInput: function(),
        upcomingInput: function(),
        showPosition: function(),
        test_match: function(regex_match_array, rule_index),
        next: function(),
        lex: function(),
        begin: function(condition),
        popState: function(),
        _currentRules: function(),
        topState: function(),
        pushState: function(condition),

        options: {
            ranges: boolean           (optional: true ==> token location info will include a .range[] member)
            flex: boolean             (optional: true ==> flex-like lexing behaviour where the rules are tested exhaustively to find the longest match)
            backtrack_lexer: boolean  (optional: true ==> lexer regexes are tested in order and for each matching regex the action code is invoked; the lexer terminates the scan when a token is returned by the action code)
        },

        performAction: function(yy, yy_, $avoiding_name_collisions, YY_START),
        rules: [...],
        conditions: {associative list: name ==> set},
    }
  }


  token location info (@$, _$, etc.): {
    first_line: n,
    last_line: n,
    first_column: n,
    last_column: n,
    range: [start_number, end_number]       (where the numbers are indexes into the input string, regular zero-based)
  }


  the parseError function receives a 'hash' object with these members for lexer and parser errors: {
    text:        (matched text)
    token:       (the produced terminal token, if any)
    line:        (yylineno)
  }
  while parser (grammar) errors will also provide these members, i.e. parser errors deliver a superset of attributes: {
    loc:         (yylloc)
    expected:    (string describing the set of expected tokens)
    recoverable: (boolean: TRUE when the parser has a error recovery rule available for this particular error)
  }
*/
var parser = (function(){
var o=function(k,v,o,l){for(o=o||{},l=k.length;l--;o[k[l]]=v);return o},$V0=[1,11,12],$V1=[2,37],$V2=[1,4],$V3=[1,11],$V4=[2,4],$V5=[1,7],$V6=[1,8,11,12,19,20,21,22,23,24,25,26,27,28,31,32,33,34,36,37,38,39,40],$V7=[12,19,20,21,22,23,24,25,26,27,28,32,34,37,38],$V8=[1,34],$V9=[1,23],$Va=[1,24],$Vb=[1,25],$Vc=[1,26],$Vd=[1,27],$Ve=[1,28],$Vf=[1,29],$Vg=[1,30],$Vh=[1,33],$Vi=[1,35],$Vj=[1,39],$Vk=[1,38],$Vl=[1,31],$Vm=[1,32],$Vn=[1,11,31,33],$Vo=[1,46],$Vp=[1,47],$Vq=[1,11,12,19,20,21,22,23,24,25,26,27,28,31,32,33,34,37,38,39,40],$Vr=[19,20,21,22,23,24,25,26],$Vs=[1,11,12,19,20,21,22,23,24,25,26,27,28,31,32,33,34,36,37,38,39,40];
var parser = {trace: function trace() { },
yy: {},
symbols_: {"error":2,"style_attribute":3,"space_or_empty":4,"declarations":5,"declaration_list":6,"property":7,":":8,"expr":9,"prio":10,";":11,"IDENT":12,"term":13,"term_list":14,"operator":15,"numeric_term":16,"unary_operator":17,"string_term":18,"NUMBER":19,"PERCENTAGE":20,"LENGTH":21,"EMS":22,"EXS":23,"ANGLE":24,"TIME":25,"FREQ":26,"STRING":27,"URI":28,"hexcolor":29,"function":30,"IMPORTANT_SYM":31,"FUNCTION":32,")":33,"HASH":34,"at_least_one_space":35,"S":36,"+":37,"-":38,"/":39,",":40,"$accept":0,"$end":1},
terminals_: {2:"error",8:":",11:";",12:"IDENT",19:"NUMBER",20:"PERCENTAGE",21:"LENGTH",22:"EMS",23:"EXS",24:"ANGLE",25:"TIME",26:"FREQ",27:"STRING",28:"URI",31:"IMPORTANT_SYM",32:"FUNCTION",33:")",34:"HASH",36:"S",37:"+",38:"-",39:"/",40:","},
productions_: [0,[3,3],[5,4],[5,5],[5,0],[6,3],[6,4],[6,0],[7,2],[9,2],[14,1],[14,2],[14,2],[14,3],[14,0],[13,1],[13,2],[13,1],[16,2],[16,2],[16,2],[16,2],[16,2],[16,2],[16,2],[16,2],[18,2],[18,2],[18,2],[18,2],[18,2],[10,2],[30,5],[29,2],[35,1],[35,2],[4,1],[4,0],[17,1],[17,1],[15,2],[15,2]],
performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate /* action[1] */, $$ /* vstack */, _$ /* lstack */) {
/* this == yyval */

var $0 = $$.length - 1;
switch (yystate) {
case 1:

      this.$ = [];
      var r = this.$;
      $$[$0-1] !== null? this.$.push($$[$0-1]) : '';
      $$[$0] !== null? $$[$0].forEach(function(e) { r.push(e); }) : ''
      return this.$;
    
break;
case 2:

      this.$ = {};
      this.$.key = $$[$0-3];
      this.$.value = $$[$0];
    
break;
case 3:

      this.$ = {};
      this.$.key = $$[$0-4];
      this.$.value = $$[$0-1] + ' ' + $$[$0];				/* TODO: should i need to add a space */
    
break;
case 4: case 7: case 14:
this.$ = null;
break;
case 5:

      this.$ = [];
      if ($$[$0] !== null) this.$.push($$[$0]);
    
break;
case 6:

      this.$ = [];
      this.$ = $$[$0-3];
      if ($$[$0] !== null) this.$.push($$[$0]);
    
break;
case 8: case 20: case 21: case 22: case 23: case 24: case 25: case 26: case 27: case 28: case 29: case 30: case 31: case 33: case 40: case 41:
this.$ = $$[$0-1];
break;
case 9:

      this.$ = $$[$0-1];
      if ($$[$0] !== null) this.$ = $$[$0-1] + ' ' + $$[$0];
    
break;
case 10: case 15: case 17: case 36: case 38: case 39:
this.$ = $$[$0];
break;
case 11: case 16:
this.$ = $$[$0-1] + $$[$0];
break;
case 12:
this.$ = $$[$0-1] + ' ' + $$[$0];
break;
case 13:
this.$ = $$[$0-2] + ' ' + $$[$0-1] + $$[$0];
break;
case 18: case 19:
this.$ = $$[$0-1] ;
break;
case 32:
this.$ = $$[$0-4] + $$[$0-2] + $$[$0-1];
break;
case 34: case 35:
this.$ = " ";
break;
case 37:
this.$ = "";
break;
}
},
table: [o($V0,$V1,{3:1,4:2,35:3,36:$V2}),{1:[3]},o($V3,$V4,{5:5,7:6,12:$V5}),o([1,8,11,12,19,20,21,22,23,24,25,26,27,28,31,32,33,34,37,38,39,40],[2,36],{36:[1,8]}),o($V6,[2,34]),{1:[2,7],6:9,11:[1,10]},{8:$V3},{4:12,8:$V1,35:3,36:$V2},o($V6,[2,35]),{1:[2,1],11:[1,13]},o($V0,$V1,{35:3,4:14,36:$V2}),o($V7,$V1,{35:3,4:15,36:$V2}),{8:[2,8]},o($V0,$V1,{35:3,4:16,36:$V2}),o($V3,$V4,{7:6,5:17,12:$V5}),{9:18,12:$V8,13:19,16:20,17:21,18:22,19:$V9,20:$Va,21:$Vb,22:$Vc,23:$Vd,24:$Ve,25:$Vf,26:$Vg,27:$Vh,28:$Vi,29:36,30:37,32:$Vj,34:$Vk,37:$Vl,38:$Vm},o($V3,$V4,{7:6,5:40,12:$V5}),o($V3,[2,5]),o($V3,[2,2],{10:41,31:[1,42]}),o($Vn,[2,14],{16:20,17:21,18:22,29:36,30:37,14:43,13:44,15:45,12:$V8,19:$V9,20:$Va,21:$Vb,22:$Vc,23:$Vd,24:$Ve,25:$Vf,26:$Vg,27:$Vh,28:$Vi,32:$Vj,34:$Vk,37:$Vl,38:$Vm,39:$Vo,40:$Vp}),o($Vq,[2,15]),{16:48,19:$V9,20:$Va,21:$Vb,22:$Vc,23:$Vd,24:$Ve,25:$Vf,26:$Vg},o($Vq,[2,17]),o($Vq,$V1,{35:3,4:49,36:$V2}),o($Vq,$V1,{35:3,4:50,36:$V2}),o($Vq,$V1,{35:3,4:51,36:$V2}),o($Vq,$V1,{35:3,4:52,36:$V2}),o($Vq,$V1,{35:3,4:53,36:$V2}),o($Vq,$V1,{35:3,4:54,36:$V2}),o($Vq,$V1,{35:3,4:55,36:$V2}),o($Vq,$V1,{35:3,4:56,36:$V2}),o($Vr,[2,38]),o($Vr,[2,39]),o($Vq,$V1,{35:3,4:57,36:$V2}),o($Vq,$V1,{35:3,4:58,36:$V2}),o($Vq,$V1,{35:3,4:59,36:$V2}),o($Vq,$V1,{35:3,4:60,36:$V2}),o($Vq,$V1,{35:3,4:61,36:$V2}),o($Vq,$V1,{35:3,4:62,36:$V2}),o($V7,$V1,{35:3,4:63,36:$V2}),o($V3,[2,6]),o($V3,[2,3]),o($V3,$V1,{35:3,4:64,36:$V2}),o($Vn,[2,9],{16:20,17:21,18:22,29:36,30:37,13:65,15:66,12:$V8,19:$V9,20:$Va,21:$Vb,22:$Vc,23:$Vd,24:$Ve,25:$Vf,26:$Vg,27:$Vh,28:$Vi,32:$Vj,34:$Vk,37:$Vl,38:$Vm,39:$Vo,40:$Vp}),o($Vq,[2,10]),{12:$V8,13:67,16:20,17:21,18:22,19:$V9,20:$Va,21:$Vb,22:$Vc,23:$Vd,24:$Ve,25:$Vf,26:$Vg,27:$Vh,28:$Vi,29:36,30:37,32:$Vj,34:$Vk,37:$Vl,38:$Vm},o($V7,$V1,{35:3,4:68,36:$V2}),o($V7,$V1,{35:3,4:69,36:$V2}),o($Vq,[2,16]),o($Vq,[2,18]),o($Vq,[2,19]),o($Vq,[2,20]),o($Vq,[2,21]),o($Vq,[2,22]),o($Vq,[2,23]),o($Vq,[2,24]),o($Vq,[2,25]),o($Vq,[2,26]),o($Vq,[2,27]),o($Vq,[2,28]),o($Vq,[2,29]),o($Vq,[2,30]),o($Vs,[2,33]),{9:70,12:$V8,13:19,16:20,17:21,18:22,19:$V9,20:$Va,21:$Vb,22:$Vc,23:$Vd,24:$Ve,25:$Vf,26:$Vg,27:$Vh,28:$Vi,29:36,30:37,32:$Vj,34:$Vk,37:$Vl,38:$Vm},o($V3,[2,31]),o($Vq,[2,12]),{12:$V8,13:71,16:20,17:21,18:22,19:$V9,20:$Va,21:$Vb,22:$Vc,23:$Vd,24:$Ve,25:$Vf,26:$Vg,27:$Vh,28:$Vi,29:36,30:37,32:$Vj,34:$Vk,37:$Vl,38:$Vm},o($Vq,[2,11]),o($V7,[2,40]),o($V7,[2,41]),{33:[1,72]},o($Vq,[2,13]),o($Vq,$V1,{35:3,4:73,36:$V2}),o($Vs,[2,32])],
defaultActions: {12:[2,8]},
parseError: function parseError(str, hash) {
    if (hash.recoverable) {
        this.trace(str);
    } else {
        throw new Error(str);
    }
},
parse: function parse(input) {
    var self = this, stack = [0], tstack = [], vstack = [null], lstack = [], table = this.table, yytext = '', yylineno = 0, yyleng = 0, recovering = 0, TERROR = 2, EOF = 1;
    var args = lstack.slice.call(arguments, 1);
    var lexer = Object.create(this.lexer);
    var sharedState = { yy: {} };
    for (var k in this.yy) {
        if (Object.prototype.hasOwnProperty.call(this.yy, k)) {
            sharedState.yy[k] = this.yy[k];
        }
    }
    lexer.setInput(input, sharedState.yy);
    sharedState.yy.lexer = lexer;
    sharedState.yy.parser = this;
    if (typeof lexer.yylloc == 'undefined') {
        lexer.yylloc = {};
    }
    var yyloc = lexer.yylloc;
    lstack.push(yyloc);
    var ranges = lexer.options && lexer.options.ranges;
    if (typeof sharedState.yy.parseError === 'function') {
        this.parseError = sharedState.yy.parseError;
    } else {
        this.parseError = Object.getPrototypeOf(this).parseError;
    }
    function popStack(n) {
        stack.length = stack.length - 2 * n;
        vstack.length = vstack.length - n;
        lstack.length = lstack.length - n;
    }
    _token_stack:
        function lex() {
            var token;
            token = lexer.lex() || EOF;
            if (typeof token !== 'number') {
                token = self.symbols_[token] || token;
            }
            return token;
        }
    var symbol, preErrorSymbol, state, action, a, r, yyval = {}, p, len, newState, expected;
    while (true) {
        state = stack[stack.length - 1];
        if (this.defaultActions[state]) {
            action = this.defaultActions[state];
        } else {
            if (symbol === null || typeof symbol == 'undefined') {
                symbol = lex();
            }
            action = table[state] && table[state][symbol];
        }
                    if (typeof action === 'undefined' || !action.length || !action[0]) {
                var errStr = '';
                expected = [];
                for (p in table[state]) {
                    if (this.terminals_[p] && p > TERROR) {
                        expected.push('\'' + this.terminals_[p] + '\'');
                    }
                }
                if (lexer.showPosition) {
                    errStr = 'Parse error on line ' + (yylineno + 1) + ':\n' + lexer.showPosition() + '\nExpecting ' + expected.join(', ') + ', got \'' + (this.terminals_[symbol] || symbol) + '\'';
                } else {
                    errStr = 'Parse error on line ' + (yylineno + 1) + ': Unexpected ' + (symbol == EOF ? 'end of input' : '\'' + (this.terminals_[symbol] || symbol) + '\'');
                }
                this.parseError(errStr, {
                    text: lexer.match,
                    token: this.terminals_[symbol] || symbol,
                    line: lexer.yylineno,
                    loc: yyloc,
                    expected: expected
                });
            }
        if (action[0] instanceof Array && action.length > 1) {
            throw new Error('Parse Error: multiple actions possible at state: ' + state + ', token: ' + symbol);
        }
        switch (action[0]) {
        case 1:
            stack.push(symbol);
            vstack.push(lexer.yytext);
            lstack.push(lexer.yylloc);
            stack.push(action[1]);
            symbol = null;
            if (!preErrorSymbol) {
                yyleng = lexer.yyleng;
                yytext = lexer.yytext;
                yylineno = lexer.yylineno;
                yyloc = lexer.yylloc;
                if (recovering > 0) {
                    recovering--;
                }
            } else {
                symbol = preErrorSymbol;
                preErrorSymbol = null;
            }
            break;
        case 2:
            len = this.productions_[action[1]][1];
            yyval.$ = vstack[vstack.length - len];
            yyval._$ = {
                first_line: lstack[lstack.length - (len || 1)].first_line,
                last_line: lstack[lstack.length - 1].last_line,
                first_column: lstack[lstack.length - (len || 1)].first_column,
                last_column: lstack[lstack.length - 1].last_column
            };
            if (ranges) {
                yyval._$.range = [
                    lstack[lstack.length - (len || 1)].range[0],
                    lstack[lstack.length - 1].range[1]
                ];
            }
            r = this.performAction.apply(yyval, [
                yytext,
                yyleng,
                yylineno,
                sharedState.yy,
                action[1],
                vstack,
                lstack
            ].concat(args));
            if (typeof r !== 'undefined') {
                return r;
            }
            if (len) {
                stack = stack.slice(0, -1 * len * 2);
                vstack = vstack.slice(0, -1 * len);
                lstack = lstack.slice(0, -1 * len);
            }
            stack.push(this.productions_[action[1]][0]);
            vstack.push(yyval.$);
            lstack.push(yyval._$);
            newState = table[stack[stack.length - 2]][stack[stack.length - 1]];
            stack.push(newState);
            break;
        case 3:
            return true;
        }
    }
    return true;
}};
/* generated by jison-lex 0.3.4 */
var lexer = (function(){
var lexer = ({

EOF:1,

parseError:function parseError(str, hash) {
        if (this.yy.parser) {
            this.yy.parser.parseError(str, hash);
        } else {
            throw new Error(str);
        }
    },

// resets the lexer, sets new input
setInput:function (input, yy) {
        this.yy = yy || this.yy || {};
        this._input = input;
        this._more = this._backtrack = this.done = false;
        this.yylineno = this.yyleng = 0;
        this.yytext = this.matched = this.match = '';
        this.conditionStack = ['INITIAL'];
        this.yylloc = {
            first_line: 1,
            first_column: 0,
            last_line: 1,
            last_column: 0
        };
        if (this.options.ranges) {
            this.yylloc.range = [0,0];
        }
        this.offset = 0;
        return this;
    },

// consumes and returns one char from the input
input:function () {
        var ch = this._input[0];
        this.yytext += ch;
        this.yyleng++;
        this.offset++;
        this.match += ch;
        this.matched += ch;
        var lines = ch.match(/(?:\r\n?|\n).*/g);
        if (lines) {
            this.yylineno++;
            this.yylloc.last_line++;
        } else {
            this.yylloc.last_column++;
        }
        if (this.options.ranges) {
            this.yylloc.range[1]++;
        }

        this._input = this._input.slice(1);
        return ch;
    },

// unshifts one char (or a string) into the input
unput:function (ch) {
        var len = ch.length;
        var lines = ch.split(/(?:\r\n?|\n)/g);

        this._input = ch + this._input;
        this.yytext = this.yytext.substr(0, this.yytext.length - len);
        //this.yyleng -= len;
        this.offset -= len;
        var oldLines = this.match.split(/(?:\r\n?|\n)/g);
        this.match = this.match.substr(0, this.match.length - 1);
        this.matched = this.matched.substr(0, this.matched.length - 1);

        if (lines.length - 1) {
            this.yylineno -= lines.length - 1;
        }
        var r = this.yylloc.range;

        this.yylloc = {
            first_line: this.yylloc.first_line,
            last_line: this.yylineno + 1,
            first_column: this.yylloc.first_column,
            last_column: lines ?
                (lines.length === oldLines.length ? this.yylloc.first_column : 0)
                 + oldLines[oldLines.length - lines.length].length - lines[0].length :
              this.yylloc.first_column - len
        };

        if (this.options.ranges) {
            this.yylloc.range = [r[0], r[0] + this.yyleng - len];
        }
        this.yyleng = this.yytext.length;
        return this;
    },

// When called from action, caches matched text and appends it on next action
more:function () {
        this._more = true;
        return this;
    },

// When called from action, signals the lexer that this rule fails to match the input, so the next matching rule (regex) should be tested instead.
reject:function () {
        if (this.options.backtrack_lexer) {
            this._backtrack = true;
        } else {
            return this.parseError('Lexical error on line ' + (this.yylineno + 1) + '. You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).\n' + this.showPosition(), {
                text: "",
                token: null,
                line: this.yylineno
            });

        }
        return this;
    },

// retain first n characters of the match
less:function (n) {
        this.unput(this.match.slice(n));
    },

// displays already matched input, i.e. for error messages
pastInput:function () {
        var past = this.matched.substr(0, this.matched.length - this.match.length);
        return (past.length > 20 ? '...':'') + past.substr(-20).replace(/\n/g, "");
    },

// displays upcoming input, i.e. for error messages
upcomingInput:function () {
        var next = this.match;
        if (next.length < 20) {
            next += this._input.substr(0, 20-next.length);
        }
        return (next.substr(0,20) + (next.length > 20 ? '...' : '')).replace(/\n/g, "");
    },

// displays the character position where the lexing error occurred, i.e. for error messages
showPosition:function () {
        var pre = this.pastInput();
        var c = new Array(pre.length + 1).join("-");
        return pre + this.upcomingInput() + "\n" + c + "^";
    },

// test the lexed token: return FALSE when not a match, otherwise return token
test_match:function (match, indexed_rule) {
        var token,
            lines,
            backup;

        if (this.options.backtrack_lexer) {
            // save context
            backup = {
                yylineno: this.yylineno,
                yylloc: {
                    first_line: this.yylloc.first_line,
                    last_line: this.last_line,
                    first_column: this.yylloc.first_column,
                    last_column: this.yylloc.last_column
                },
                yytext: this.yytext,
                match: this.match,
                matches: this.matches,
                matched: this.matched,
                yyleng: this.yyleng,
                offset: this.offset,
                _more: this._more,
                _input: this._input,
                yy: this.yy,
                conditionStack: this.conditionStack.slice(0),
                done: this.done
            };
            if (this.options.ranges) {
                backup.yylloc.range = this.yylloc.range.slice(0);
            }
        }

        lines = match[0].match(/(?:\r\n?|\n).*/g);
        if (lines) {
            this.yylineno += lines.length;
        }
        this.yylloc = {
            first_line: this.yylloc.last_line,
            last_line: this.yylineno + 1,
            first_column: this.yylloc.last_column,
            last_column: lines ?
                         lines[lines.length - 1].length - lines[lines.length - 1].match(/\r?\n?/)[0].length :
                         this.yylloc.last_column + match[0].length
        };
        this.yytext += match[0];
        this.match += match[0];
        this.matches = match;
        this.yyleng = this.yytext.length;
        if (this.options.ranges) {
            this.yylloc.range = [this.offset, this.offset += this.yyleng];
        }
        this._more = false;
        this._backtrack = false;
        this._input = this._input.slice(match[0].length);
        this.matched += match[0];
        token = this.performAction.call(this, this.yy, this, indexed_rule, this.conditionStack[this.conditionStack.length - 1]);
        if (this.done && this._input) {
            this.done = false;
        }
        if (token) {
            return token;
        } else if (this._backtrack) {
            // recover context
            for (var k in backup) {
                this[k] = backup[k];
            }
            return false; // rule action called reject() implying the next rule should be tested instead.
        }
        return false;
    },

// return next match in input
next:function () {
        if (this.done) {
            return this.EOF;
        }
        if (!this._input) {
            this.done = true;
        }

        var token,
            match,
            tempMatch,
            index;
        if (!this._more) {
            this.yytext = '';
            this.match = '';
        }
        var rules = this._currentRules();
        for (var i = 0; i < rules.length; i++) {
            tempMatch = this._input.match(this.rules[rules[i]]);
            if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
                match = tempMatch;
                index = i;
                if (this.options.backtrack_lexer) {
                    token = this.test_match(tempMatch, rules[i]);
                    if (token !== false) {
                        return token;
                    } else if (this._backtrack) {
                        match = false;
                        continue; // rule action called reject() implying a rule MISmatch.
                    } else {
                        // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
                        return false;
                    }
                } else if (!this.options.flex) {
                    break;
                }
            }
        }
        if (match) {
            token = this.test_match(match, rules[index]);
            if (token !== false) {
                return token;
            }
            // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
            return false;
        }
        if (this._input === "") {
            return this.EOF;
        } else {
            return this.parseError('Lexical error on line ' + (this.yylineno + 1) + '. Unrecognized text.\n' + this.showPosition(), {
                text: "",
                token: null,
                line: this.yylineno
            });
        }
    },

// return next match that has a token
lex:function lex() {
        var r = this.next();
        if (r) {
            return r;
        } else {
            return this.lex();
        }
    },

// activates a new lexer condition state (pushes the new lexer condition state onto the condition stack)
begin:function begin(condition) {
        this.conditionStack.push(condition);
    },

// pop the previously active lexer condition state off the condition stack
popState:function popState() {
        var n = this.conditionStack.length - 1;
        if (n > 0) {
            return this.conditionStack.pop();
        } else {
            return this.conditionStack[0];
        }
    },

// produce the lexer rule set which is active for the currently active lexer condition state
_currentRules:function _currentRules() {
        if (this.conditionStack.length && this.conditionStack[this.conditionStack.length - 1]) {
            return this.conditions[this.conditionStack[this.conditionStack.length - 1]].rules;
        } else {
            return this.conditions["INITIAL"].rules;
        }
    },

// return the currently active lexer condition state; when an index argument is provided it produces the N-th previous condition state, if available
topState:function topState(n) {
        n = this.conditionStack.length - 1 - Math.abs(n || 0);
        if (n >= 0) {
            return this.conditionStack[n];
        } else {
            return "INITIAL";
        }
    },

// alias for begin(condition)
pushState:function pushState(condition) {
        this.begin(condition);
    },

// return the number of states currently on the stack
stateStackSize:function stateStackSize() {
        return this.conditionStack.length;
    },
options: {},
performAction: function anonymous(yy,yy_,$avoiding_name_collisions,YY_START) {
var YYSTATE=YY_START;
switch($avoiding_name_collisions) {
case 0:return 36;
break;
case 1:
break;
case 2:
break;
case 3:return 'CDO';
break;
case 4:return 'CDC';
break;
case 5:return 'INCLUDES';
break;
case 6:return 'DASHMATCH';
break;
case 7:return 'PREFIXMATCH';
break;
case 8:return 'SUFFIXMATCH';
break;
case 9:return 'SUBSTRINGMATCH';
break;
case 10:return 'COLUMN';
break;
case 11:return 27;
break;
case 12:return 'BAD_STRING';
break;
case 13:return 28;
break;
case 14:return 28;
break;
case 15:return 'BAD_URI';
break;
case 16:return 31;
break;
case 17:return 'IMPORT_SYM';
break;
case 18:return 'PAGE_SYM';
break;
case 19:return 'MEDIA_SYM';
break;
case 20:return 'CHARSET_SYM';
break;
case 21:return 'UNICODERANGE';
break;
case 22:return 'MEDIA_TYPE_PREFIX';
break;
case 23:return 'MEDIA_TYPE_PREFIX';
break;
case 24:return 'MEDIA_TYPE_AND';
break;
case 25:return 32;
break;
case 26:return 12;
break;
case 27:return 'VENDOR';
break;
case 28:return 'ATKEYWORD';
break;
case 29:return 34;
break;
case 30:return 22;
break;
case 31:return 23;
break;
case 32:return 21;
break;
case 33:return 21;
break;
case 34:return 21;
break;
case 35:return 21;
break;
case 36:return 21;
break;
case 37:return 21;
break;
case 38:return 24;
break;
case 39:return 24;
break;
case 40:return 24;
break;
case 41:return 25;
break;
case 42:return 25;
break;
case 43:return 26;
break;
case 44:return 26;
break;
case 45:return 20;
break;
case 46:return 19;
break;
case 47:return 'DIMENSION';
break;
case 48:return yy_.yytext; /* 'DELIM'; */
break;
}
},
rules: [/^(?:([ \t\r\n\f]+))/,/^(?:\/\*[^*]*\*+([^/*][^*]*\*+)*\/)/,/^(?:((\/\*[^*]*\*+([^/*][^*]*\*+)*)|(\/\*[^*]*(\*+[^/*][^*]*)*)))/,/^(?:<!--)/,/^(?:-->)/,/^(?:~=)/,/^(?:\|=)/,/^(?:\^=)/,/^(?:\$=)/,/^(?:\*=)/,/^(?:\|\|)/,/^(?:(("([ !#$%&'\(\)\*+,\-\.\/:;<=>\?@\[\\\]^_`\{\|\}~]|[a-zA-Z0-9])*")|('([ !#$%&"\(\)\*+,\-\.\/:;<=>\?@\[\\\]^_`\{\|\}~]|[a-zA-Z0-9])*')))/,/^(?:(("([^\n\r\f\\"]|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*\\?)|('([^\n\r\f\\']|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*\\?)))/,/^(?:url\((([ \t\r\n\f]+)?)(("([ !#$%&'\(\)\*+,\-\.\/:;<=>\?@\[\\\]^_`\{\|\}~]|[a-zA-Z0-9])*")|('([ !#$%&"\(\)\*+,\-\.\/:;<=>\?@\[\\\]^_`\{\|\}~]|[a-zA-Z0-9])*'))(([ \t\r\n\f]+)?)\))/,/^(?:url\((([ \t\r\n\f]+)?)(([a-zA-Z0-9]|[:\/\?#\[\]@]|[!$&'\*+,;=]|[%]|[\-\._~])*)(([ \t\r\n\f]+)?)\))/,/^(?:((url\((([ \t\r\n\f]+)?)([!#$%&*-\[\]-~]|([\240-\377])|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*(([ \t\r\n\f]+)?))|(url\((([ \t\r\n\f]+)?)(("([ !#$%&'\(\)\*+,\-\.\/:;<=>\?@\[\\\]^_`\{\|\}~]|[a-zA-Z0-9])*")|('([ !#$%&"\(\)\*+,\-\.\/:;<=>\?@\[\\\]^_`\{\|\}~]|[a-zA-Z0-9])*'))(([ \t\r\n\f]+)?))|(url\((([ \t\r\n\f]+)?)(("([^\n\r\f\\"]|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*\\?)|('([^\n\r\f\\']|\\(\n|\r\n|\r|\f)|((\\([0-9a-fA-F]){1,6}(\r\n|[ \t\r\n\f])?)|\\[^\r\n\f0-9a-fA-F]))*\\?)))))/,/^(?:!((([ \t\r\n\f]+)?)|(\/\*[^*]*\*+([^/*][^*]*\*+)*\/))*(I|i|\\0{0,4}(49|69)(\r\n|[ \t\r\n\f])?|\\[i])(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m])(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(O|o|\\0{0,4}(4f|6f)(\r\n|[ \t\r\n\f])?|\\[o])(R|r|\\0{0,4}(52|72)(\r\n|[ \t\r\n\f])?|\\[r])(T|t|\\0{0,4}(54|74)(\r\n|[ \t\r\n\f])?|\\[t])(A|a|\\0{0,4}(41|61)(\r\n|[ \t\r\n\f])?)(N|n|\\0{0,4}(4e|6e)(\r\n|[ \t\r\n\f])?|\\[n])(T|t|\\0{0,4}(54|74)(\r\n|[ \t\r\n\f])?|\\[t]))/,/^(?:@(I|i|\\0{0,4}(49|69)(\r\n|[ \t\r\n\f])?|\\[i])(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m])(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(O|o|\\0{0,4}(4f|6f)(\r\n|[ \t\r\n\f])?|\\[o])(R|r|\\0{0,4}(52|72)(\r\n|[ \t\r\n\f])?|\\[r])(T|t|\\0{0,4}(54|74)(\r\n|[ \t\r\n\f])?|\\[t]))/,/^(?:@(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(A|a|\\0{0,4}(41|61)(\r\n|[ \t\r\n\f])?)(G|g|\\0{0,4}(47|67)(\r\n|[ \t\r\n\f])?|\\[g])(E|e|\\0{0,4}(45|65)(\r\n|[ \t\r\n\f])?))/,/^(?:@(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m])(E|e|\\0{0,4}(45|65)(\r\n|[ \t\r\n\f])?)(D|d|\\0{0,4}(44|64)(\r\n|[ \t\r\n\f])?)(I|i|\\0{0,4}(49|69)(\r\n|[ \t\r\n\f])?|\\[i])(A|a|\\0{0,4}(41|61)(\r\n|[ \t\r\n\f])?))/,/^(?:@charset )/,/^(?:(U|u|\\0{0,4}(55|75)(\r\n|[ \t\r\n\f])?|\\[u])\+([0-9a-fA-F?]{1,6}(-[0-9a-fA-F]{1,6})?))/,/^(?:only\b)/,/^(?:not\b)/,/^(?:and\b)/,/^(?:([\-]?([_a-zA-Z])([_a-zA-Z0-9\-])*)\()/,/^(?:([\-]?([_a-zA-Z])([_a-zA-Z0-9\-])*))/,/^(?:([\-_]([0-9a-fA-F])-([0-9a-fA-F])))/,/^(?:@([\-]?([_a-zA-Z])([_a-zA-Z0-9\-])*))/,/^(?:#(([_a-zA-Z0-9\-])+))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9])?|\.[0-9]+([eE][+\-][0-9])?)(E|e|\\0{0,4}(45|65)(\r\n|[ \t\r\n\f])?)(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9])?|\.[0-9]+([eE][+\-][0-9])?)(E|e|\\0{0,4}(45|65)(\r\n|[ \t\r\n\f])?)(X|x|\\0{0,4}(58|78)(\r\n|[ \t\r\n\f])?|\\[x]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9])?|\.[0-9]+([eE][+\-][0-9])?)(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(X|x|\\0{0,4}(58|78)(\r\n|[ \t\r\n\f])?|\\[x]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9])?|\.[0-9]+([eE][+\-][0-9])?)(C|c|\\0{0,4}(43|63)(\r\n|[ \t\r\n\f])?)(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9])?|\.[0-9]+([eE][+\-][0-9])?)(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m])(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9])?|\.[0-9]+([eE][+\-][0-9])?)(I|i|\\0{0,4}(49|69)(\r\n|[ \t\r\n\f])?|\\[i])(N|n|\\0{0,4}(4e|6e)(\r\n|[ \t\r\n\f])?|\\[n]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9])?|\.[0-9]+([eE][+\-][0-9])?)(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(T|t|\\0{0,4}(54|74)(\r\n|[ \t\r\n\f])?|\\[t]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9])?|\.[0-9]+([eE][+\-][0-9])?)(P|p|\\0{0,4}(50|70)(\r\n|[ \t\r\n\f])?|\\[p])(C|c|\\0{0,4}(43|63)(\r\n|[ \t\r\n\f])?))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9])?|\.[0-9]+([eE][+\-][0-9])?)(D|d|\\0{0,4}(44|64)(\r\n|[ \t\r\n\f])?)(E|e|\\0{0,4}(45|65)(\r\n|[ \t\r\n\f])?)(G|g|\\0{0,4}(47|67)(\r\n|[ \t\r\n\f])?|\\[g]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9])?|\.[0-9]+([eE][+\-][0-9])?)(R|r|\\0{0,4}(52|72)(\r\n|[ \t\r\n\f])?|\\[r])(A|a|\\0{0,4}(41|61)(\r\n|[ \t\r\n\f])?)(D|d|\\0{0,4}(44|64)(\r\n|[ \t\r\n\f])?))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9])?|\.[0-9]+([eE][+\-][0-9])?)(G|g|\\0{0,4}(47|67)(\r\n|[ \t\r\n\f])?|\\[g])(R|r|\\0{0,4}(52|72)(\r\n|[ \t\r\n\f])?|\\[r])(A|a|\\0{0,4}(41|61)(\r\n|[ \t\r\n\f])?)(D|d|\\0{0,4}(44|64)(\r\n|[ \t\r\n\f])?))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9])?|\.[0-9]+([eE][+\-][0-9])?)(M|m|\\0{0,4}(4d|6d)(\r\n|[ \t\r\n\f])?|\\[m])(S|s|\\0{0,4}(53|73)(\r\n|[ \t\r\n\f])?|\\[s]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9])?|\.[0-9]+([eE][+\-][0-9])?)(S|s|\\0{0,4}(53|73)(\r\n|[ \t\r\n\f])?|\\[s]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9])?|\.[0-9]+([eE][+\-][0-9])?)(H|h|\\0{0,4}(48|68)(\r\n|[ \t\r\n\f])?|\\[h])(Z|z|\\0{0,4}(5a|7a)(\r\n|[ \t\r\n\f])?|\\[z]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9])?|\.[0-9]+([eE][+\-][0-9])?)(K|k|\\0{0,4}(4b|6b)(\r\n|[ \t\r\n\f])?|\\[k])(H|h|\\0{0,4}(48|68)(\r\n|[ \t\r\n\f])?|\\[h])(Z|z|\\0{0,4}(5a|7a)(\r\n|[ \t\r\n\f])?|\\[z]))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9])?|\.[0-9]+([eE][+\-][0-9])?)%)/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9])?|\.[0-9]+([eE][+\-][0-9])?))/,/^(?:([0-9]+(\.[0-9]+)?([eE][+\-][0-9])?|\.[0-9]+([eE][+\-][0-9])?)([\-]?([_a-zA-Z])([_a-zA-Z0-9\-])*))/,/^(?:.)/],
conditions: {"INITIAL":{"rules":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48],"inclusive":true}}
});
return lexer;
})();
parser.lexer = lexer;
function Parser () {
  this.yy = {};
}
Parser.prototype = parser;parser.Parser = Parser;
return new Parser;
})();


if (typeof require !== 'undefined' && typeof exports !== 'undefined') {
exports.parser = parser;
exports.Parser = parser.Parser;
exports.parse = function () { return parser.parse.apply(parser, arguments); };
exports.main = function commonjsMain(args) {
    if (!args[1]) {
        console.log('Usage: '+args[0]+' FILE');
        process.exit(1);
    }
    var source = require('fs').readFileSync(require('path').normalize(args[1]), "utf8");
    return exports.parser.parse(source);
};
if (typeof module !== 'undefined' && require.main === module) {
  exports.main(process.argv.slice(1));
}
}
}).call(this,require('_process'))
},{"_process":11,"fs":9,"path":10}],9:[function(require,module,exports){

},{}],10:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require('_process'))
},{"_process":11}],11:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            currentQueue[queueIndex].run();
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],12:[function(require,module,exports){
/*
Copyright (c) 2015, Yahoo! Inc. All rights reserved.
Copyrights licensed under the New BSD License.
See the accompanying LICENSE file for terms.

Authors: Nera Liu <neraliu@yahoo-inc.com>
         Adonis Fung <adon@yahoo-inc.com>
         Albert Yu <albertyu@yahoo-inc.com>
*/
/*jshint node: true */

exports._getPrivFilters = function () {

    var LT     = /</g,
        QUOT   = /"/g,
        SQUOT  = /'/g,
        AMP    = /&/g,
        NULL   = /\x00/g,
        SPECIAL_ATTR_VALUE_UNQUOTED_CHARS = /(?:^$|[\x00\x09-\x0D "'`=<>])/g,
        SPECIAL_HTML_CHARS = /[&<>"'`]/g, 
        SPECIAL_COMMENT_CHARS = /(?:\x00|^-*!?>|--!?>|--?!?$|\]>|\]$)/g;

    // CSS sensitive chars: ()"'/,!*@{}:;
    // By CSS: (Tab|NewLine|colon|semi|lpar|rpar|apos|sol|comma|excl|ast|midast);|(quot|QUOT)
    // By URI_PROTOCOL: (Tab|NewLine);
    var SENSITIVE_HTML_ENTITIES = /&(?:#([xX][0-9A-Fa-f]+|\d+);?|(Tab|NewLine|colon|semi|lpar|rpar|apos|sol|comma|excl|ast|midast|ensp|emsp|thinsp);|(nbsp|amp|AMP|lt|LT|gt|GT|quot|QUOT);?)/g,
        SENSITIVE_NAMED_REF_MAP = {Tab: '\t', NewLine: '\n', colon: ':', semi: ';', lpar: '(', rpar: ')', apos: '\'', sol: '/', comma: ',', excl: '!', ast: '*', midast: '*', ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009', nbsp: '\xA0', amp: '&', lt: '<', gt: '>', quot: '"', QUOT: '"'};

    // TODO: CSS_DANGEROUS_FUNCTION_NAME = /(url\(|expression\()/ig;
    var CSS_UNQUOTED_CHARS = /[^%#+\-\w\.]/g,
        // \x7F and \x01-\x1F less \x09 are for Safari 5.0
        CSS_DOUBLE_QUOTED_CHARS = /[\x01-\x1F\x7F\\"]/g,
        CSS_SINGLE_QUOTED_CHARS = /[\x01-\x1F\x7F\\']/g,
        // this assumes encodeURI() and encodeURIComponent() has escaped 1-32, 41, 127 for IE8
        CSS_UNQUOTED_URL = /['\(\)]/g; // " \ treated by encodeURI()   

    // Given a full URI, need to support "[" ( IPv6address ) "]" in URI as per RFC3986
    // Reference: https://tools.ietf.org/html/rfc3986
    var URL_IPV6 = /\/\/%5[Bb]([A-Fa-f0-9:]+)%5[Dd]/;


    // Reference: http://shazzer.co.uk/database/All/characters-allowd-in-html-entities
    // Reference: http://shazzer.co.uk/vector/Characters-allowed-after-ampersand-in-named-character-references
    // Reference: http://shazzer.co.uk/database/All/Characters-before-javascript-uri
    // Reference: http://shazzer.co.uk/database/All/Characters-after-javascript-uri
    // Reference: https://html.spec.whatwg.org/multipage/syntax.html#consume-a-character-reference
    // Reference for named characters: https://html.spec.whatwg.org/multipage/entities.json
    var URI_BLACKLIST_PROTOCOLS = {'javascript':1, 'data':1, 'vbscript':1, 'mhtml':1},
        URI_PROTOCOL_COLON = /(?::|&#[xX]0*3[aA];?|&#0*58;?|&colon;)/,
        URI_PROTOCOL_WHITESPACES = /(?:^[\x00-\x20]+|[\t\n\r\x00]+)/g,
        URI_PROTOCOL_NAMED_REF_MAP = {Tab: '\t', NewLine: '\n'};

    var x, 
        strReplace = function (s, regexp, callback) {
            return s === undefined ? 'undefined'
                    : s === null            ? 'null'
                    : s.toString().replace(regexp, callback);
        },
        fromCodePoint = String.fromCodePoint || function(codePoint) {
            if (arguments.length === 0) {
                return '';
            }
            if (codePoint <= 0xFFFF) { // BMP code point
                return String.fromCharCode(codePoint);
            }

            // Astral code point; split in surrogate halves
            // http://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
            codePoint -= 0x10000;
            return String.fromCharCode((codePoint >> 10) + 0xD800, (codePoint % 0x400) + 0xDC00);
        };


    function getProtocol(s) {
        s = s.split(URI_PROTOCOL_COLON, 2);
        return (s.length === 2 && s[0]) ? s[0] : null;
    }

    function htmlDecode(s, namedRefMap, reNamedRef, skipReplacement) {
        
        namedRefMap = namedRefMap || SENSITIVE_NAMED_REF_MAP;
        reNamedRef = reNamedRef || SENSITIVE_HTML_ENTITIES;

        function regExpFunction(m, num, named, named1) {
            if (num) {
                num = Number(num[0] <= '9' ? num : '0' + num);
                // switch(num) {
                //     case 0x80: return '\u20AC';  // EURO SIGN (€)
                //     case 0x82: return '\u201A';  // SINGLE LOW-9 QUOTATION MARK (‚)
                //     case 0x83: return '\u0192';  // LATIN SMALL LETTER F WITH HOOK (ƒ)
                //     case 0x84: return '\u201E';  // DOUBLE LOW-9 QUOTATION MARK („)
                //     case 0x85: return '\u2026';  // HORIZONTAL ELLIPSIS (…)
                //     case 0x86: return '\u2020';  // DAGGER (†)
                //     case 0x87: return '\u2021';  // DOUBLE DAGGER (‡)
                //     case 0x88: return '\u02C6';  // MODIFIER LETTER CIRCUMFLEX ACCENT (ˆ)
                //     case 0x89: return '\u2030';  // PER MILLE SIGN (‰)
                //     case 0x8A: return '\u0160';  // LATIN CAPITAL LETTER S WITH CARON (Š)
                //     case 0x8B: return '\u2039';  // SINGLE LEFT-POINTING ANGLE QUOTATION MARK (‹)
                //     case 0x8C: return '\u0152';  // LATIN CAPITAL LIGATURE OE (Œ)
                //     case 0x8E: return '\u017D';  // LATIN CAPITAL LETTER Z WITH CARON (Ž)
                //     case 0x91: return '\u2018';  // LEFT SINGLE QUOTATION MARK (‘)
                //     case 0x92: return '\u2019';  // RIGHT SINGLE QUOTATION MARK (’)
                //     case 0x93: return '\u201C';  // LEFT DOUBLE QUOTATION MARK (“)
                //     case 0x94: return '\u201D';  // RIGHT DOUBLE QUOTATION MARK (”)
                //     case 0x95: return '\u2022';  // BULLET (•)
                //     case 0x96: return '\u2013';  // EN DASH (–)
                //     case 0x97: return '\u2014';  // EM DASH (—)
                //     case 0x98: return '\u02DC';  // SMALL TILDE (˜)
                //     case 0x99: return '\u2122';  // TRADE MARK SIGN (™)
                //     case 0x9A: return '\u0161';  // LATIN SMALL LETTER S WITH CARON (š)
                //     case 0x9B: return '\u203A';  // SINGLE RIGHT-POINTING ANGLE QUOTATION MARK (›)
                //     case 0x9C: return '\u0153';  // LATIN SMALL LIGATURE OE (œ)
                //     case 0x9E: return '\u017E';  // LATIN SMALL LETTER Z WITH CARON (ž)
                //     case 0x9F: return '\u0178';  // LATIN CAPITAL LETTER Y WITH DIAERESIS (Ÿ)
                // }
                // // num >= 0xD800 && num <= 0xDFFF, and 0x0D is separately handled, as it doesn't fall into the range of x.pec()
                // return (num >= 0xD800 && num <= 0xDFFF) || num === 0x0D ? '\uFFFD' : x.frCoPt(num);

                return skipReplacement ? fromCodePoint(num)
                        : num === 0x80 ? '\u20AC'  // EURO SIGN (€)
                        : num === 0x82 ? '\u201A'  // SINGLE LOW-9 QUOTATION MARK (‚)
                        : num === 0x83 ? '\u0192'  // LATIN SMALL LETTER F WITH HOOK (ƒ)
                        : num === 0x84 ? '\u201E'  // DOUBLE LOW-9 QUOTATION MARK („)
                        : num === 0x85 ? '\u2026'  // HORIZONTAL ELLIPSIS (…)
                        : num === 0x86 ? '\u2020'  // DAGGER (†)
                        : num === 0x87 ? '\u2021'  // DOUBLE DAGGER (‡)
                        : num === 0x88 ? '\u02C6'  // MODIFIER LETTER CIRCUMFLEX ACCENT (ˆ)
                        : num === 0x89 ? '\u2030'  // PER MILLE SIGN (‰)
                        : num === 0x8A ? '\u0160'  // LATIN CAPITAL LETTER S WITH CARON (Š)
                        : num === 0x8B ? '\u2039'  // SINGLE LEFT-POINTING ANGLE QUOTATION MARK (‹)
                        : num === 0x8C ? '\u0152'  // LATIN CAPITAL LIGATURE OE (Œ)
                        : num === 0x8E ? '\u017D'  // LATIN CAPITAL LETTER Z WITH CARON (Ž)
                        : num === 0x91 ? '\u2018'  // LEFT SINGLE QUOTATION MARK (‘)
                        : num === 0x92 ? '\u2019'  // RIGHT SINGLE QUOTATION MARK (’)
                        : num === 0x93 ? '\u201C'  // LEFT DOUBLE QUOTATION MARK (“)
                        : num === 0x94 ? '\u201D'  // RIGHT DOUBLE QUOTATION MARK (”)
                        : num === 0x95 ? '\u2022'  // BULLET (•)
                        : num === 0x96 ? '\u2013'  // EN DASH (–)
                        : num === 0x97 ? '\u2014'  // EM DASH (—)
                        : num === 0x98 ? '\u02DC'  // SMALL TILDE (˜)
                        : num === 0x99 ? '\u2122'  // TRADE MARK SIGN (™)
                        : num === 0x9A ? '\u0161'  // LATIN SMALL LETTER S WITH CARON (š)
                        : num === 0x9B ? '\u203A'  // SINGLE RIGHT-POINTING ANGLE QUOTATION MARK (›)
                        : num === 0x9C ? '\u0153'  // LATIN SMALL LIGATURE OE (œ)
                        : num === 0x9E ? '\u017E'  // LATIN SMALL LETTER Z WITH CARON (ž)
                        : num === 0x9F ? '\u0178'  // LATIN CAPITAL LETTER Y WITH DIAERESIS (Ÿ)
                        : (num >= 0xD800 && num <= 0xDFFF) || num === 0x0D ? '\uFFFD'
                        : x.frCoPt(num);
            }
            return namedRefMap[named || named1] || m;
        }

        return s === undefined  ? 'undefined'
            : s === null        ? 'null'
            : s.toString().replace(NULL, '\uFFFD').replace(reNamedRef, regExpFunction);
    }

    function cssEncode(chr) {
        // space after \\HEX is needed by spec
        return '\\' + chr.charCodeAt(0).toString(16).toLowerCase() + ' ';
    }
    function css(s, reSensitiveChars) {
        return htmlDecode(s).replace(reSensitiveChars, cssEncode);
    }
    function cssUrl(s, reSensitiveChars) {
        // encodeURI() in yufull() will throw error for use of the CSS_UNSUPPORTED_CODE_POINT (i.e., [\uD800-\uDFFF])
        s = x.yufull(htmlDecode(s));
        var protocol = getProtocol(s);

        // prefix ## for blacklisted protocols
        if (protocol && URI_BLACKLIST_PROTOCOLS[protocol.toLowerCase()]) {
            s = '##' + s;
        }

        return reSensitiveChars ? s.replace(reSensitiveChars, cssEncode) : s;
    }

    return (x = {
        // turn invalid codePoints and that of non-characters to \uFFFD, and then fromCodePoint()
        frCoPt: function(num) {
            return num === undefined || num === null ? '' :
                !isFinite(num = Number(num)) || // `NaN`, `+Infinity`, or `-Infinity`
                num <= 0 ||                     // not a valid Unicode code point
                num > 0x10FFFF ||               // not a valid Unicode code point
                // Math.floor(num) != num || 

                (num >= 0x01 && num <= 0x08) ||
                (num >= 0x0E && num <= 0x1F) ||
                (num >= 0x7F && num <= 0x9F) ||
                (num >= 0xFDD0 && num <= 0xFDEF) ||
                
                 num === 0x0B || 
                (num & 0xFFFF) === 0xFFFF || 
                (num & 0xFFFF) === 0xFFFE ? '\uFFFD' : fromCodePoint(num);
        },
        d: htmlDecode,
        /*
         * @param {string} s - An untrusted uri input
         * @returns {string} s - null if relative url, otherwise the protocol with whitespaces stripped and lower-cased
         */
        yup: function(s) {
            s = getProtocol(s.replace(NULL, ''));
            // URI_PROTOCOL_WHITESPACES is required for left trim and remove interim whitespaces
            return s ? htmlDecode(s, URI_PROTOCOL_NAMED_REF_MAP, null, true).replace(URI_PROTOCOL_WHITESPACES, '').toLowerCase() : null;
        },

        /*
         * @deprecated
         * @param {string} s - An untrusted user input
         * @returns {string} s - The original user input with & < > " ' ` encoded respectively as &amp; &lt; &gt; &quot; &#39; and &#96;.
         *
         */
        y: function(s) {
            return strReplace(s, SPECIAL_HTML_CHARS, function (m) {
                return m === '&' ? '&amp;'
                    :  m === '<' ? '&lt;'
                    :  m === '>' ? '&gt;'
                    :  m === '"' ? '&quot;'
                    :  m === "'" ? '&#39;'
                    :  /*m === '`'*/ '&#96;';       // in hex: 60
            });
        },

        // This filter is meant to introduce double-encoding, and should be used with extra care.
        ya: function(s) {
            return strReplace(s, AMP, '&amp;');
        },

        // FOR DETAILS, refer to inHTMLData()
        // Reference: https://html.spec.whatwg.org/multipage/syntax.html#data-state
        yd: function (s) {
            return strReplace(s, LT, '&lt;');
        },

        // FOR DETAILS, refer to inHTMLComment()
        // All NULL characters in s are first replaced with \uFFFD.
        // If s contains -->, --!>, or starts with -*>, insert a space right before > to stop state breaking at <!--{{{yc s}}}-->
        // If s ends with --!, --, or -, append a space to stop collaborative state breaking at {{{yc s}}}>, {{{yc s}}}!>, {{{yc s}}}-!>, {{{yc s}}}->
        // Reference: https://html.spec.whatwg.org/multipage/syntax.html#comment-state
        // Reference: http://shazzer.co.uk/vector/Characters-that-close-a-HTML-comment-3
        // Reference: http://shazzer.co.uk/vector/Characters-that-close-a-HTML-comment
        // Reference: http://shazzer.co.uk/vector/Characters-that-close-a-HTML-comment-0021
        // If s contains ]> or ends with ], append a space after ] is verified in IE to stop IE conditional comments.
        // Reference: http://msdn.microsoft.com/en-us/library/ms537512%28v=vs.85%29.aspx
        // We do not care --\s>, which can possibly be intepreted as a valid close comment tag in very old browsers (e.g., firefox 3.6), as specified in the html4 spec
        // Reference: http://www.w3.org/TR/html401/intro/sgmltut.html#h-3.2.4
        yc: function (s) {
            return strReplace(s, SPECIAL_COMMENT_CHARS, function(m){
                return m === '\x00' ? '\uFFFD'
                    : m === '--!' || m === '--' || m === '-' || m === ']' ? m + ' '
                    :/*
                    :  m === ']>'   ? '] >'
                    :  m === '-->'  ? '-- >'
                    :  m === '--!>' ? '--! >'
                    : /-*!?>/.test(m) ? */ m.slice(0, -1) + ' >';
            });
        },

        // FOR DETAILS, refer to inDoubleQuotedAttr()
        // Reference: https://html.spec.whatwg.org/multipage/syntax.html#attribute-value-(double-quoted)-state
        yavd: function (s) {
            return strReplace(s, QUOT, '&quot;');
        },

        // FOR DETAILS, refer to inSingleQuotedAttr()
        // Reference: https://html.spec.whatwg.org/multipage/syntax.html#attribute-value-(single-quoted)-state
        yavs: function (s) {
            return strReplace(s, SQUOT, '&#39;');
        },

        // FOR DETAILS, refer to inUnQuotedAttr()
        // PART A.
        // if s contains any state breaking chars (\t, \n, \v, \f, \r, space, and >),
        // they are escaped and encoded into their equivalent HTML entity representations. 
        // Reference: http://shazzer.co.uk/database/All/Characters-which-break-attributes-without-quotes
        // Reference: https://html.spec.whatwg.org/multipage/syntax.html#attribute-value-(unquoted)-state
        //
        // PART B. 
        // if s starts with ', " or `, encode it resp. as &#39;, &quot;, or &#96; to 
        // enforce the attr value (unquoted) state
        // Reference: https://html.spec.whatwg.org/multipage/syntax.html#before-attribute-value-state
        // Reference: http://shazzer.co.uk/vector/Characters-allowed-attribute-quote
        // 
        // PART C.
        // Inject a \uFFFD character if an empty or all null string is encountered in 
        // unquoted attribute value state.
        // 
        // Rationale 1: our belief is that developers wouldn't expect an 
        //   empty string would result in ' name="passwd"' rendered as 
        //   attribute value, even though this is how HTML5 is specified.
        // Rationale 2: an empty or all null string (for IE) can 
        //   effectively alter its immediate subsequent state, we choose
        //   \uFFFD to end the unquoted attr 
        //   state, which therefore will not mess up later contexts.
        // Rationale 3: Since IE 6, it is verified that NULL chars are stripped.
        // Reference: https://html.spec.whatwg.org/multipage/syntax.html#attribute-value-(unquoted)-state
        // 
        // Example:
        // <input value={{{yavu s}}} name="passwd"/>
        yavu: function (s) {
            return strReplace(s, SPECIAL_ATTR_VALUE_UNQUOTED_CHARS, function (m) {
                return m === '\t'   ? '&#9;'  // in hex: 09
                    :  m === '\n'   ? '&#10;' // in hex: 0A
                    :  m === '\x0B' ? '&#11;' // in hex: 0B  for IE. IE<9 \v equals v, so use \x0B instead
                    :  m === '\f'   ? '&#12;' // in hex: 0C
                    :  m === '\r'   ? '&#13;' // in hex: 0D
                    :  m === ' '    ? '&#32;' // in hex: 20
                    :  m === '='    ? '&#61;' // in hex: 3D
                    :  m === '<'    ? '&lt;'
                    :  m === '>'    ? '&gt;'
                    :  m === '"'    ? '&quot;'
                    :  m === "'"    ? '&#39;'
                    :  m === '`'    ? '&#96;'
                    : /*empty or null*/ '\uFFFD';
            });
        },

        yu: encodeURI,
        yuc: encodeURIComponent,

        // Notice that yubl MUST BE APPLIED LAST, and will not be used independently (expected output from encodeURI/encodeURIComponent and yavd/yavs/yavu)
        // This is used to disable JS execution capabilities by prefixing x- to ^javascript:, ^vbscript: or ^data: that possibly could trigger script execution in URI attribute context
        yubl: function (s) {
            return URI_BLACKLIST_PROTOCOLS[x.yup(s)] ? 'x-' + s : s;
        },

        // This is NOT a security-critical filter.
        // Reference: https://tools.ietf.org/html/rfc3986
        yufull: function (s) {
            return x.yu(s).replace(URL_IPV6, function(m, p) {
                return '//[' + p + ']';
            });
        },

        // chain yufull() with yubl()
        yublf: function (s) {
            return x.yubl(x.yufull(s));
        },

        // The design principle of the CSS filter MUST meet the following goal(s).
        // (1) The input cannot break out of the context (expr) and this is to fulfill the just sufficient encoding principle.
        // (2) The input cannot introduce CSS parsing error and this is to address the concern of UI redressing.
        //
        // term
        //   : unary_operator?
        //     [ NUMBER S* | PERCENTAGE S* | LENGTH S* | EMS S* | EXS S* | ANGLE S* |
        //     TIME S* | FREQ S* ]
        //   | STRING S* | IDENT S* | URI S* | hexcolor | function
        // 
        // Reference:
        // * http://www.w3.org/TR/CSS21/grammar.html 
        // * http://www.w3.org/TR/css-syntax-3/
        // 
        // NOTE: delimitar in CSS - \ _ : ; ( ) " ' / , % # ! * @ . { }

        // CSS_UNQUOTED_CHARS = /[^%#+\-\w\.]/g,
        yceu: function(s) {
            return css(s, CSS_UNQUOTED_CHARS);
        },

        // string1 = \"([^\n\r\f\\"]|\\{nl}|\\[^\n\r\f0-9a-f]|\\[0-9a-f]{1,6}(\r\n|[ \n\r\t\f])?)*\"
        // CSS_DOUBLE_QUOTED_CHARS = /[\x01-\x1F\x7F\\"]/g,
        yced: function(s) {
            return css(s, CSS_DOUBLE_QUOTED_CHARS);
        },

        // string2 = \'([^\n\r\f\\']|\\{nl}|\\[^\n\r\f0-9a-f]|\\[0-9a-f]{1,6}(\r\n|[ \n\r\t\f])?)*\'
        // CSS_SINGLE_QUOTED_CHARS = /[\x01-\x1F\x7F\\']/g,
        yces: function(s) {
            return css(s, CSS_SINGLE_QUOTED_CHARS);
        },

        // for url({{{yceuu url}}}
        // unquoted_url = ([!#$%&*-~]|\\{h}{1,6}(\r\n|[ \t\r\n\f])?|\\[^\r\n\f0-9a-f])* (CSS 2.1 definition)
        // unquoted_url = ([^"'()\\ \t\n\r\f\v\u0000\u0008\u000b\u000e-\u001f\u007f]|\\{h}{1,6}(\r\n|[ \t\r\n\f])?|\\[^\r\n\f0-9a-f])* (CSS 3.0 definition)
        // The state machine in CSS 3.0 is more well defined - http://www.w3.org/TR/css-syntax-3/#consume-a-url-token0
        // CSS_UNQUOTED_URL = /['\(\)]/g; // " \ treated by encodeURI()   
        yceuu: function(s) {
            return cssUrl(s, CSS_UNQUOTED_URL);
        },

        // for url("{{{yceud url}}}
        // CSS_DOUBLE_QUOTED_URL has nothing else to escape (optimized version by chaining with yufull)
        yceud: function(s) { 
            return cssUrl(s);
        },

        // for url('{{{yceus url}}}
        // CSS_SINGLE_QUOTED_URL = /'/g; (optimized version by chaining with yufull)
        yceus: function(s) { 
            return cssUrl(s, SQUOT);
        }
    });
};

// exposing privFilters
// this is an undocumented feature, and please use it with extra care
var privFilters = exports._privFilters = exports._getPrivFilters();


/* chaining filters */

// uriInAttr and literally uriPathInAttr
// yubl is always used 
// Rationale: given pattern like this: <a href="{{{uriPathInDoubleQuotedAttr s}}}">
//            developer may expect s is always prefixed with ? or /, but an attacker can abuse it with 'javascript:alert(1)'
function uriInAttr (s, yav, yu) {
    return privFilters.yubl(yav((yu || privFilters.yufull)(s)));
}

/** 
* Yahoo Secure XSS Filters - just sufficient output filtering to prevent XSS!
* @module xss-filters 
*/

/**
* @function module:xss-filters#inHTMLData
*
* @param {string} s - An untrusted user input
* @returns {string} The string s with '<' encoded as '&amp;lt;'
*
* @description
* This filter is to be placed in HTML Data context to encode all '<' characters into '&amp;lt;'
* <ul>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#data-state">HTML5 Data State</a></li>
* </ul>
*
* @example
* // output context to be applied by this filter.
* <div>{{{inHTMLData htmlData}}}</div>
*
*/
exports.inHTMLData = privFilters.yd;

/**
* @function module:xss-filters#inHTMLComment
*
* @param {string} s - An untrusted user input
* @returns {string} All NULL characters in s are first replaced with \uFFFD. If s contains -->, --!>, or starts with -*>, insert a space right before > to stop state breaking at <!--{{{yc s}}}-->. If s ends with --!, --, or -, append a space to stop collaborative state breaking at {{{yc s}}}>, {{{yc s}}}!>, {{{yc s}}}-!>, {{{yc s}}}->. If s contains ]> or ends with ], append a space after ] is verified in IE to stop IE conditional comments.
*
* @description
* This filter is to be placed in HTML Comment context
* <ul>
* <li><a href="http://shazzer.co.uk/vector/Characters-that-close-a-HTML-comment-3">Shazzer - Closing comments for -.-></a>
* <li><a href="http://shazzer.co.uk/vector/Characters-that-close-a-HTML-comment">Shazzer - Closing comments for --.></a>
* <li><a href="http://shazzer.co.uk/vector/Characters-that-close-a-HTML-comment-0021">Shazzer - Closing comments for .></a>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#comment-start-state">HTML5 Comment Start State</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#comment-start-dash-state">HTML5 Comment Start Dash State</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#comment-state">HTML5 Comment State</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#comment-end-dash-state">HTML5 Comment End Dash State</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#comment-end-state">HTML5 Comment End State</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#comment-end-bang-state">HTML5 Comment End Bang State</a></li>
* <li><a href="http://msdn.microsoft.com/en-us/library/ms537512%28v=vs.85%29.aspx">Conditional Comments in Internet Explorer</a></li>
* </ul>
*
* @example
* // output context to be applied by this filter.
* <!-- {{{inHTMLComment html_comment}}} -->
*
*/
exports.inHTMLComment = privFilters.yc;

/**
* @function module:xss-filters#inSingleQuotedAttr
*
* @param {string} s - An untrusted user input
* @returns {string} The string s with any single-quote characters encoded into '&amp;&#39;'.
*
* @description
* <p class="warning">Warning: This is NOT designed for any onX (e.g., onclick) attributes!</p>
* <p class="warning">Warning: If you're working on URI/components, use the more specific uri___InSingleQuotedAttr filter </p>
* This filter is to be placed in HTML Attribute Value (single-quoted) state to encode all single-quote characters into '&amp;&#39;'
*
* <ul>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#attribute-value-(single-quoted)-state">HTML5 Attribute Value (Single-Quoted) State</a></li>
* </ul>
*
* @example
* // output context to be applied by this filter.
* <input name='firstname' value='{{{inSingleQuotedAttr firstname}}}' />
*
*/
exports.inSingleQuotedAttr = privFilters.yavs;

/**
* @function module:xss-filters#inDoubleQuotedAttr
*
* @param {string} s - An untrusted user input
* @returns {string} The string s with any single-quote characters encoded into '&amp;&quot;'.
*
* @description
* <p class="warning">Warning: This is NOT designed for any onX (e.g., onclick) attributes!</p>
* <p class="warning">Warning: If you're working on URI/components, use the more specific uri___InDoubleQuotedAttr filter </p>
* This filter is to be placed in HTML Attribute Value (double-quoted) state to encode all single-quote characters into '&amp;&quot;'
*
* <ul>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#attribute-value-(double-quoted)-state">HTML5 Attribute Value (Double-Quoted) State</a></li>
* </ul>
*
* @example
* // output context to be applied by this filter.
* <input name="firstname" value="{{{inDoubleQuotedAttr firstname}}}" />
*
*/
exports.inDoubleQuotedAttr = privFilters.yavd;

/**
* @function module:xss-filters#inUnQuotedAttr
*
* @param {string} s - An untrusted user input
* @returns {string} If s contains any state breaking chars (\t, \n, \v, \f, \r, space, null, ', ", `, <, >, and =), they are escaped and encoded into their equivalent HTML entity representations. If the string is empty, inject a \uFFFD character.
*
* @description
* <p class="warning">Warning: This is NOT designed for any onX (e.g., onclick) attributes!</p>
* <p class="warning">Warning: If you're working on URI/components, use the more specific uri___InUnQuotedAttr filter </p>
* <p>Regarding \uFFFD injection, given <a id={{{id}}} name="passwd">,<br/>
*        Rationale 1: our belief is that developers wouldn't expect when id equals an
*          empty string would result in ' name="passwd"' rendered as 
*          attribute value, even though this is how HTML5 is specified.<br/>
*        Rationale 2: an empty or all null string (for IE) can 
*          effectively alter its immediate subsequent state, we choose
*          \uFFFD to end the unquoted attr 
*          state, which therefore will not mess up later contexts.<br/>
*        Rationale 3: Since IE 6, it is verified that NULL chars are stripped.<br/>
*        Reference: https://html.spec.whatwg.org/multipage/syntax.html#attribute-value-(unquoted)-state</p>
* <ul>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#attribute-value-(unquoted)-state">HTML5 Attribute Value (Unquoted) State</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#before-attribute-value-state">HTML5 Before Attribute Value State</a></li>
* <li><a href="http://shazzer.co.uk/database/All/Characters-which-break-attributes-without-quotes">Shazzer - Characters-which-break-attributes-without-quotes</a></li>
* <li><a href="http://shazzer.co.uk/vector/Characters-allowed-attribute-quote">Shazzer - Characters-allowed-attribute-quote</a></li>
* </ul>
*
* @example
* // output context to be applied by this filter.
* <input name="firstname" value={{{inUnQuotedAttr firstname}}} />
*
*/
exports.inUnQuotedAttr = privFilters.yavu;


/**
* @function module:xss-filters#uriInSingleQuotedAttr
*
* @param {string} s - An untrusted user input, supposedly an <strong>absolute</strong> URI
* @returns {string} The string s encoded first by window.encodeURI(), then inSingleQuotedAttr(), and finally prefix the resulted string with 'x-' if it begins with 'javascript:' or 'vbscript:' that could possibly lead to script execution
*
* @description
* This filter is to be placed in HTML Attribute Value (single-quoted) state for an <strong>absolute</strong> URI.<br/>
* The correct order of encoders is thus: first window.encodeURI(), then inSingleQuotedAttr(), and finally prefix the resulted string with 'x-' if it begins with 'javascript:' or 'vbscript:' that could possibly lead to script execution
*
* <p>Notice: This filter is IPv6 friendly by not encoding '[' and ']'.</p>
*
* <ul>
* <li><a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURI">encodeURI | MDN</a></li>
* <li><a href="http://tools.ietf.org/html/rfc3986">RFC 3986</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#attribute-value-(single-quoted)-state">HTML5 Attribute Value (Single-Quoted) State</a></li>
* </ul>
*
* @example
* // output context to be applied by this filter.
* <a href='{{{uriInSingleQuotedAttr full_uri}}}'>link</a>
* 
*/
exports.uriInSingleQuotedAttr = function (s) {
    return uriInAttr(s, privFilters.yavs);
};

/**
* @function module:xss-filters#uriInDoubleQuotedAttr
*
* @param {string} s - An untrusted user input, supposedly an <strong>absolute</strong> URI
* @returns {string} The string s encoded first by window.encodeURI(), then inDoubleQuotedAttr(), and finally prefix the resulted string with 'x-' if it begins with 'javascript:' or 'vbscript:' that could possibly lead to script execution
*
* @description
* This filter is to be placed in HTML Attribute Value (double-quoted) state for an <strong>absolute</strong> URI.<br/>
* The correct order of encoders is thus: first window.encodeURI(), then inDoubleQuotedAttr(), and finally prefix the resulted string with 'x-' if it begins with 'javascript:' or 'vbscript:' that could possibly lead to script execution
*
* <p>Notice: This filter is IPv6 friendly by not encoding '[' and ']'.</p>
*
* <ul>
* <li><a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURI">encodeURI | MDN</a></li>
* <li><a href="http://tools.ietf.org/html/rfc3986">RFC 3986</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#attribute-value-(double-quoted)-state">HTML5 Attribute Value (Double-Quoted) State</a></li>
* </ul>
*
* @example
* // output context to be applied by this filter.
* <a href="{{{uriInDoubleQuotedAttr full_uri}}}">link</a>
* 
*/
exports.uriInDoubleQuotedAttr = function (s) {
    return uriInAttr(s, privFilters.yavd);
};


/**
* @function module:xss-filters#uriInUnQuotedAttr
*
* @param {string} s - An untrusted user input, supposedly an <strong>absolute</strong> URI
* @returns {string} The string s encoded first by window.encodeURI(), then inUnQuotedAttr(), and finally prefix the resulted string with 'x-' if it begins with 'javascript:' or 'vbscript:' that could possibly lead to script execution
*
* @description
* This filter is to be placed in HTML Attribute Value (unquoted) state for an <strong>absolute</strong> URI.<br/>
* The correct order of encoders is thus: first the built-in encodeURI(), then inUnQuotedAttr(), and finally prefix the resulted string with 'x-' if it begins with 'javascript:' or 'vbscript:' that could possibly lead to script execution
*
* <p>Notice: This filter is IPv6 friendly by not encoding '[' and ']'.</p>
*
* <ul>
* <li><a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURI">encodeURI | MDN</a></li>
* <li><a href="http://tools.ietf.org/html/rfc3986">RFC 3986</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#attribute-value-(unquoted)-state">HTML5 Attribute Value (Unquoted) State</a></li>
* </ul>
*
* @example
* // output context to be applied by this filter.
* <a href={{{uriInUnQuotedAttr full_uri}}}>link</a>
* 
*/
exports.uriInUnQuotedAttr = function (s) {
    return uriInAttr(s, privFilters.yavu);
};

/**
* @function module:xss-filters#uriInHTMLData
*
* @param {string} s - An untrusted user input, supposedly an <strong>absolute</strong> URI
* @returns {string} The string s encoded by window.encodeURI() and then inHTMLData()
*
* @description
* This filter is to be placed in HTML Data state for an <strong>absolute</strong> URI.
*
* <p>Notice: The actual implementation skips inHTMLData(), since '<' is already encoded as '%3C' by encodeURI().</p>
* <p>Notice: This filter is IPv6 friendly by not encoding '[' and ']'.</p>
*
* <ul>
* <li><a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURI">encodeURI | MDN</a></li>
* <li><a href="http://tools.ietf.org/html/rfc3986">RFC 3986</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#data-state">HTML5 Data State</a></li>
* </ul>
*
* @example
* // output context to be applied by this filter.
* <a href="/somewhere">{{{uriInHTMLData full_uri}}}</a>
* 
*/
exports.uriInHTMLData = privFilters.yufull;


/**
* @function module:xss-filters#uriInHTMLComment
*
* @param {string} s - An untrusted user input, supposedly an <strong>absolute</strong> URI
* @returns {string} The string s encoded by window.encodeURI(), and finally inHTMLComment()
*
* @description
* This filter is to be placed in HTML Comment state for an <strong>absolute</strong> URI.
*
* <p>Notice: This filter is IPv6 friendly by not encoding '[' and ']'.</p>
*
* <ul>
* <li><a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURI">encodeURI | MDN</a></li>
* <li><a href="http://tools.ietf.org/html/rfc3986">RFC 3986</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#data-state">HTML5 Data State</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#comment-state">HTML5 Comment State</a></li>
* </ul>
*
* @example
* // output context to be applied by this filter.
* <!-- {{{uriInHTMLComment full_uri}}} -->
* 
*/
exports.uriInHTMLComment = function (s) {
    return privFilters.yc(privFilters.yufull(s));
};




/**
* @function module:xss-filters#uriPathInSingleQuotedAttr
*
* @param {string} s - An untrusted user input, supposedly a URI Path/Query or relative URI
* @returns {string} The string s encoded first by window.encodeURI(), then inSingleQuotedAttr(), and finally prefix the resulted string with 'x-' if it begins with 'javascript:' or 'vbscript:' that could possibly lead to script execution
*
* @description
* This filter is to be placed in HTML Attribute Value (single-quoted) state for a URI Path/Query or relative URI.<br/>
* The correct order of encoders is thus: first window.encodeURI(), then inSingleQuotedAttr(), and finally prefix the resulted string with 'x-' if it begins with 'javascript:' or 'vbscript:' that could possibly lead to script execution
*
* <ul>
* <li><a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURI">encodeURI | MDN</a></li>
* <li><a href="http://tools.ietf.org/html/rfc3986">RFC 3986</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#attribute-value-(single-quoted)-state">HTML5 Attribute Value (Single-Quoted) State</a></li>
* </ul>
*
* @example
* // output context to be applied by this filter.
* <a href='http://example.com/{{{uriPathInSingleQuotedAttr uri_path}}}'>link</a>
* <a href='http://example.com/?{{{uriQueryInSingleQuotedAttr uri_query}}}'>link</a>
* 
*/
exports.uriPathInSingleQuotedAttr = function (s) {
    return uriInAttr(s, privFilters.yavs, privFilters.yu);
};

/**
* @function module:xss-filters#uriPathInDoubleQuotedAttr
*
* @param {string} s - An untrusted user input, supposedly a URI Path/Query or relative URI
* @returns {string} The string s encoded first by window.encodeURI(), then inDoubleQuotedAttr(), and finally prefix the resulted string with 'x-' if it begins with 'javascript:' or 'vbscript:' that could possibly lead to script execution
*
* @description
* This filter is to be placed in HTML Attribute Value (double-quoted) state for a URI Path/Query or relative URI.<br/>
* The correct order of encoders is thus: first window.encodeURI(), then inDoubleQuotedAttr(), and finally prefix the resulted string with 'x-' if it begins with 'javascript:' or 'vbscript:' that could possibly lead to script execution
*
* <ul>
* <li><a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURI">encodeURI | MDN</a></li>
* <li><a href="http://tools.ietf.org/html/rfc3986">RFC 3986</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#attribute-value-(double-quoted)-state">HTML5 Attribute Value (Double-Quoted) State</a></li>
* </ul>
*
* @example
* // output context to be applied by this filter.
* <a href="http://example.com/{{{uriPathInDoubleQuotedAttr uri_path}}}">link</a>
* <a href="http://example.com/?{{{uriQueryInDoubleQuotedAttr uri_query}}}">link</a>
* 
*/
exports.uriPathInDoubleQuotedAttr = function (s) {
    return uriInAttr(s, privFilters.yavd, privFilters.yu);
};


/**
* @function module:xss-filters#uriPathInUnQuotedAttr
*
* @param {string} s - An untrusted user input, supposedly a URI Path/Query or relative URI
* @returns {string} The string s encoded first by window.encodeURI(), then inUnQuotedAttr(), and finally prefix the resulted string with 'x-' if it begins with 'javascript:' or 'vbscript:' that could possibly lead to script execution
*
* @description
* This filter is to be placed in HTML Attribute Value (unquoted) state for a URI Path/Query or relative URI.<br/>
* The correct order of encoders is thus: first the built-in encodeURI(), then inUnQuotedAttr(), and finally prefix the resulted string with 'x-' if it begins with 'javascript:' or 'vbscript:' that could possibly lead to script execution
*
* <ul>
* <li><a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURI">encodeURI | MDN</a></li>
* <li><a href="http://tools.ietf.org/html/rfc3986">RFC 3986</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#attribute-value-(unquoted)-state">HTML5 Attribute Value (Unquoted) State</a></li>
* </ul>
*
* @example
* // output context to be applied by this filter.
* <a href=http://example.com/{{{uriPathInUnQuotedAttr uri_path}}}>link</a>
* <a href=http://example.com/?{{{uriQueryInUnQuotedAttr uri_query}}}>link</a>
* 
*/
exports.uriPathInUnQuotedAttr = function (s) {
    return uriInAttr(s, privFilters.yavu, privFilters.yu);
};

/**
* @function module:xss-filters#uriPathInHTMLData
*
* @param {string} s - An untrusted user input, supposedly a URI Path/Query or relative URI
* @returns {string} The string s encoded by window.encodeURI() and then inHTMLData()
*
* @description
* This filter is to be placed in HTML Data state for a URI Path/Query or relative URI.
*
* <p>Notice: The actual implementation skips inHTMLData(), since '<' is already encoded as '%3C' by encodeURI().</p>
*
* <ul>
* <li><a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURI">encodeURI | MDN</a></li>
* <li><a href="http://tools.ietf.org/html/rfc3986">RFC 3986</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#data-state">HTML5 Data State</a></li>
* </ul>
*
* @example
* // output context to be applied by this filter.
* <a href="http://example.com/">http://example.com/{{{uriPathInHTMLData uri_path}}}</a>
* <a href="http://example.com/">http://example.com/?{{{uriQueryInHTMLData uri_query}}}</a>
* 
*/
exports.uriPathInHTMLData = privFilters.yu;


/**
* @function module:xss-filters#uriPathInHTMLComment
*
* @param {string} s - An untrusted user input, supposedly a URI Path/Query or relative URI
* @returns {string} The string s encoded by window.encodeURI(), and finally inHTMLComment()
*
* @description
* This filter is to be placed in HTML Comment state for a URI Path/Query or relative URI.
*
* <ul>
* <li><a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURI">encodeURI | MDN</a></li>
* <li><a href="http://tools.ietf.org/html/rfc3986">RFC 3986</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#data-state">HTML5 Data State</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#comment-state">HTML5 Comment State</a></li>
* </ul>
*
* @example
* // output context to be applied by this filter.
* <!-- http://example.com/{{{uriPathInHTMLComment uri_path}}} -->
* <!-- http://example.com/?{{{uriQueryInHTMLComment uri_query}}} -->
*/
exports.uriPathInHTMLComment = function (s) {
    return privFilters.yc(privFilters.yu(s));
};


/**
* @function module:xss-filters#uriQueryInSingleQuotedAttr
* @description This is an alias of {@link module:xss-filters#uriPathInSingleQuotedAttr}
* 
* @alias module:xss-filters#uriPathInSingleQuotedAttr
*/
exports.uriQueryInSingleQuotedAttr = exports.uriPathInSingleQuotedAttr;

/**
* @function module:xss-filters#uriQueryInDoubleQuotedAttr
* @description This is an alias of {@link module:xss-filters#uriPathInDoubleQuotedAttr}
* 
* @alias module:xss-filters#uriPathInDoubleQuotedAttr
*/
exports.uriQueryInDoubleQuotedAttr = exports.uriPathInDoubleQuotedAttr;

/**
* @function module:xss-filters#uriQueryInUnQuotedAttr
* @description This is an alias of {@link module:xss-filters#uriPathInUnQuotedAttr}
* 
* @alias module:xss-filters#uriPathInUnQuotedAttr
*/
exports.uriQueryInUnQuotedAttr = exports.uriPathInUnQuotedAttr;

/**
* @function module:xss-filters#uriQueryInHTMLData
* @description This is an alias of {@link module:xss-filters#uriPathInHTMLData}
* 
* @alias module:xss-filters#uriPathInHTMLData
*/
exports.uriQueryInHTMLData = exports.uriPathInHTMLData;

/**
* @function module:xss-filters#uriQueryInHTMLComment
* @description This is an alias of {@link module:xss-filters#uriPathInHTMLComment}
* 
* @alias module:xss-filters#uriPathInHTMLComment
*/
exports.uriQueryInHTMLComment = exports.uriPathInHTMLComment;



/**
* @function module:xss-filters#uriComponentInSingleQuotedAttr
*
* @param {string} s - An untrusted user input, supposedly a URI Component
* @returns {string} The string s encoded first by window.encodeURIComponent(), then inSingleQuotedAttr()
*
* @description
* This filter is to be placed in HTML Attribute Value (single-quoted) state for a URI Component.<br/>
* The correct order of encoders is thus: first window.encodeURIComponent(), then inSingleQuotedAttr()
*
*
* <ul>
* <li><a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent">encodeURIComponent | MDN</a></li>
* <li><a href="http://tools.ietf.org/html/rfc3986">RFC 3986</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#attribute-value-(single-quoted)-state">HTML5 Attribute Value (Single-Quoted) State</a></li>
* </ul>
*
* @example
* // output context to be applied by this filter.
* <a href='http://example.com/?q={{{uriComponentInSingleQuotedAttr uri_component}}}'>link</a>
* 
*/
exports.uriComponentInSingleQuotedAttr = function (s) {
    return privFilters.yavs(privFilters.yuc(s));
};

/**
* @function module:xss-filters#uriComponentInDoubleQuotedAttr
*
* @param {string} s - An untrusted user input, supposedly a URI Component
* @returns {string} The string s encoded first by window.encodeURIComponent(), then inDoubleQuotedAttr()
*
* @description
* This filter is to be placed in HTML Attribute Value (double-quoted) state for a URI Component.<br/>
* The correct order of encoders is thus: first window.encodeURIComponent(), then inDoubleQuotedAttr()
*
*
* <ul>
* <li><a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent">encodeURIComponent | MDN</a></li>
* <li><a href="http://tools.ietf.org/html/rfc3986">RFC 3986</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#attribute-value-(double-quoted)-state">HTML5 Attribute Value (Double-Quoted) State</a></li>
* </ul>
*
* @example
* // output context to be applied by this filter.
* <a href="http://example.com/?q={{{uriComponentInDoubleQuotedAttr uri_component}}}">link</a>
* 
*/
exports.uriComponentInDoubleQuotedAttr = function (s) {
    return privFilters.yavd(privFilters.yuc(s));
};


/**
* @function module:xss-filters#uriComponentInUnQuotedAttr
*
* @param {string} s - An untrusted user input, supposedly a URI Component
* @returns {string} The string s encoded first by window.encodeURIComponent(), then inUnQuotedAttr()
*
* @description
* This filter is to be placed in HTML Attribute Value (unquoted) state for a URI Component.<br/>
* The correct order of encoders is thus: first the built-in encodeURIComponent(), then inUnQuotedAttr()
*
*
* <ul>
* <li><a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent">encodeURIComponent | MDN</a></li>
* <li><a href="http://tools.ietf.org/html/rfc3986">RFC 3986</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#attribute-value-(unquoted)-state">HTML5 Attribute Value (Unquoted) State</a></li>
* </ul>
*
* @example
* // output context to be applied by this filter.
* <a href=http://example.com/?q={{{uriComponentInUnQuotedAttr uri_component}}}>link</a>
* 
*/
exports.uriComponentInUnQuotedAttr = function (s) {
    return privFilters.yavu(privFilters.yuc(s));
};

/**
* @function module:xss-filters#uriComponentInHTMLData
*
* @param {string} s - An untrusted user input, supposedly a URI Component
* @returns {string} The string s encoded by window.encodeURIComponent() and then inHTMLData()
*
* @description
* This filter is to be placed in HTML Data state for a URI Component.
*
* <p>Notice: The actual implementation skips inHTMLData(), since '<' is already encoded as '%3C' by encodeURIComponent().</p>
*
* <ul>
* <li><a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent">encodeURIComponent | MDN</a></li>
* <li><a href="http://tools.ietf.org/html/rfc3986">RFC 3986</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#data-state">HTML5 Data State</a></li>
* </ul>
*
* @example
* // output context to be applied by this filter.
* <a href="http://example.com/">http://example.com/?q={{{uriComponentInHTMLData uri_component}}}</a>
* <a href="http://example.com/">http://example.com/#{{{uriComponentInHTMLData uri_fragment}}}</a>
* 
*/
exports.uriComponentInHTMLData = privFilters.yuc;


/**
* @function module:xss-filters#uriComponentInHTMLComment
*
* @param {string} s - An untrusted user input, supposedly a URI Component
* @returns {string} The string s encoded by window.encodeURIComponent(), and finally inHTMLComment()
*
* @description
* This filter is to be placed in HTML Comment state for a URI Component.
*
* <ul>
* <li><a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent">encodeURIComponent | MDN</a></li>
* <li><a href="http://tools.ietf.org/html/rfc3986">RFC 3986</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#data-state">HTML5 Data State</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#comment-state">HTML5 Comment State</a></li>
* </ul>
*
* @example
* // output context to be applied by this filter.
* <!-- http://example.com/?q={{{uriComponentInHTMLComment uri_component}}} -->
* <!-- http://example.com/#{{{uriComponentInHTMLComment uri_fragment}}} -->
*/
exports.uriComponentInHTMLComment = function (s) {
    return privFilters.yc(privFilters.yuc(s));
};


// uriFragmentInSingleQuotedAttr
// added yubl on top of uriComponentInAttr 
// Rationale: given pattern like this: <a href='{{{uriFragmentInSingleQuotedAttr s}}}'>
//            developer may expect s is always prefixed with #, but an attacker can abuse it with 'javascript:alert(1)'

/**
* @function module:xss-filters#uriFragmentInSingleQuotedAttr
*
* @param {string} s - An untrusted user input, supposedly a URI Fragment
* @returns {string} The string s encoded first by window.encodeURIComponent(), then inSingleQuotedAttr(), and finally prefix the resulted string with 'x-' if it begins with 'javascript:' or 'vbscript:' that could possibly lead to script execution
*
* @description
* This filter is to be placed in HTML Attribute Value (single-quoted) state for a URI Fragment.<br/>
* The correct order of encoders is thus: first window.encodeURIComponent(), then inSingleQuotedAttr(), and finally prefix the resulted string with 'x-' if it begins with 'javascript:' or 'vbscript:' that could possibly lead to script execution
*
*
* <ul>
* <li><a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent">encodeURIComponent | MDN</a></li>
* <li><a href="http://tools.ietf.org/html/rfc3986">RFC 3986</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#attribute-value-(single-quoted)-state">HTML5 Attribute Value (Single-Quoted) State</a></li>
* </ul>
*
* @example
* // output context to be applied by this filter.
* <a href='http://example.com/#{{{uriFragmentInSingleQuotedAttr uri_fragment}}}'>link</a>
* 
*/
exports.uriFragmentInSingleQuotedAttr = function (s) {
    return privFilters.yubl(privFilters.yavs(privFilters.yuc(s)));
};

// uriFragmentInDoubleQuotedAttr
// added yubl on top of uriComponentInAttr 
// Rationale: given pattern like this: <a href="{{{uriFragmentInDoubleQuotedAttr s}}}">
//            developer may expect s is always prefixed with #, but an attacker can abuse it with 'javascript:alert(1)'

/**
* @function module:xss-filters#uriFragmentInDoubleQuotedAttr
*
* @param {string} s - An untrusted user input, supposedly a URI Fragment
* @returns {string} The string s encoded first by window.encodeURIComponent(), then inDoubleQuotedAttr(), and finally prefix the resulted string with 'x-' if it begins with 'javascript:' or 'vbscript:' that could possibly lead to script execution
*
* @description
* This filter is to be placed in HTML Attribute Value (double-quoted) state for a URI Fragment.<br/>
* The correct order of encoders is thus: first window.encodeURIComponent(), then inDoubleQuotedAttr(), and finally prefix the resulted string with 'x-' if it begins with 'javascript:' or 'vbscript:' that could possibly lead to script execution
*
*
* <ul>
* <li><a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent">encodeURIComponent | MDN</a></li>
* <li><a href="http://tools.ietf.org/html/rfc3986">RFC 3986</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#attribute-value-(double-quoted)-state">HTML5 Attribute Value (Double-Quoted) State</a></li>
* </ul>
*
* @example
* // output context to be applied by this filter.
* <a href="http://example.com/#{{{uriFragmentInDoubleQuotedAttr uri_fragment}}}">link</a>
* 
*/
exports.uriFragmentInDoubleQuotedAttr = function (s) {
    return privFilters.yubl(privFilters.yavd(privFilters.yuc(s)));
};

// uriFragmentInUnQuotedAttr
// added yubl on top of uriComponentInAttr 
// Rationale: given pattern like this: <a href={{{uriFragmentInUnQuotedAttr s}}}>
//            developer may expect s is always prefixed with #, but an attacker can abuse it with 'javascript:alert(1)'

/**
* @function module:xss-filters#uriFragmentInUnQuotedAttr
*
* @param {string} s - An untrusted user input, supposedly a URI Fragment
* @returns {string} The string s encoded first by window.encodeURIComponent(), then inUnQuotedAttr(), and finally prefix the resulted string with 'x-' if it begins with 'javascript:' or 'vbscript:' that could possibly lead to script execution
*
* @description
* This filter is to be placed in HTML Attribute Value (unquoted) state for a URI Fragment.<br/>
* The correct order of encoders is thus: first the built-in encodeURIComponent(), then inUnQuotedAttr(), and finally prefix the resulted string with 'x-' if it begins with 'javascript:' or 'vbscript:' that could possibly lead to script execution
*
* <ul>
* <li><a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent">encodeURIComponent | MDN</a></li>
* <li><a href="http://tools.ietf.org/html/rfc3986">RFC 3986</a></li>
* <li><a href="https://html.spec.whatwg.org/multipage/syntax.html#attribute-value-(unquoted)-state">HTML5 Attribute Value (Unquoted) State</a></li>
* </ul>
*
* @example
* // output context to be applied by this filter.
* <a href=http://example.com/#{{{uriFragmentInUnQuotedAttr uri_fragment}}}>link</a>
* 
*/
exports.uriFragmentInUnQuotedAttr = function (s) {
    return privFilters.yubl(privFilters.yavu(privFilters.yuc(s)));
};


/**
* @function module:xss-filters#uriFragmentInHTMLData
* @description This is an alias of {@link module:xss-filters#uriComponentInHTMLData}
* 
* @alias module:xss-filters#uriComponentInHTMLData
*/
exports.uriFragmentInHTMLData = exports.uriComponentInHTMLData;

/**
* @function module:xss-filters#uriFragmentInHTMLComment
* @description This is an alias of {@link module:xss-filters#uriComponentInHTMLComment}
* 
* @alias module:xss-filters#uriComponentInHTMLComment
*/
exports.uriFragmentInHTMLComment = exports.uriComponentInHTMLComment;

},{}],13:[function(require,module,exports){
/*
Copyright 2015, Yahoo Inc.
Copyrights licensed under the New BSD License.
See the accompanying LICENSE file for terms.
*/

// key is the "previous" state, key in the value object is "next" state and its value indicates what action we should take. For example, the first line indicates previous state is 1, next state is 1 and return value is 1 (and we'd have logic to add the character to output stream when return value is 1)
// this will eventually move to context parser and it will not be a sparse matrix
// Transition table based on https://html.spec.whatwg.org/multipage/syntax.html
var DerivedState = {};
DerivedState.TransitionsSparse = {
    1:  {1: 1},
    8:  {45: 5},
    10: {1: 2, 43: 6},
    13: {43: 6},
    16: {43: 6},
    19: {43: 6},
    27: {43: 6},
    34: {1: 2, 43: 6},
    35: {1: 2, 36: 3, 43: 6},
    36: {1: 2, 43: 6},
    38: {42: 4},
    39: {42: 4},
    40: {1: 2, 34: 4},
    42: {1: 2, 43: 6},
    43: {1: 2},
    44: {1: 1, 44: 1},
    45: {44: 1, 53: 1},
    46: {48: 1},
    48: {48: 1, 49: 1},
    49: {48: 1, 50: 1},
    50: {1: 1},
    53: {46: 1}
};

DerivedState.TransitionName = {};

// do nothing in the postWalk callback, input will be filtered out (default case)
DerivedState.TransitionName.NO_ACTION = 0;

// append the input to the output buffer,
// the output buffer will be returned in the purify function call
DerivedState.TransitionName.WITHIN_DATA = 1;

// core logic to handle the tagName, attribute and its value
DerivedState.TransitionName.FROM_TAG_ATTR_TO_DATA = 2;

// initialize/clean up the attribute value
DerivedState.TransitionName.ATTR_TO_AFTER_ATTR = 3;

// map the attribute value to the attribute name
DerivedState.TransitionName.ATTR_VAL_TO_AFTER_ATTR_VAL = 4;

// append the '<' with next char for markup declaration open state
DerivedState.TransitionName.TAG_OPEN_TO_MARKUP_OPEN = 5;

// set the self closing tag if solidus is encountered
DerivedState.TransitionName.TO_SELF_CLOSING_START = 6;

DerivedState.Transitions = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0],
    [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]
];

module.exports = DerivedState;


},{}],14:[function(require,module,exports){
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
        CssParser = require('css-js'),
        voidElements = whitelist.VoidElements;

    function Purifier(config) {
        var that = this;

        config = config || {};
        // defaulted to true
        config.enableCanonicalization = config.enableCanonicalization !== false;
        config.enableVoidingIEConditionalComments = config.enableVoidingIEConditionalComments !== false;
        config.enableTagBalancing = config.enableTagBalancing !== false;

        that.config = config;

        that.parser = new Parser({
            enableInputPreProcessing: true,
            enableCanonicalization: config.enableCanonicalization,
            enableVoidingIEConditionalComments: config.enableVoidingIEConditionalComments
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
            idx, tagName, attrValString, openedTag;

        
        switch (derivedState.Transitions[prevState][nextState]) {
            
        case derivedState.TransitionName.WITHIN_DATA:
            this.output += parser.input[i];
        break;

        case derivedState.TransitionName.FROM_TAG_ATTR_TO_DATA:
            idx = parser.getCurrentTagIndex();
            tagName = parser.getCurrentTag(idx);

            if (contains(whitelist.Tags, tagName)) {

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
                        this.attrVals[parser.getAttributeName()] = parser.getAttributeValue();
                    }

                    attrValString = '';
                    for (var key in this.attrVals) {
                        if (contains(whitelist.Attributes, key)) {
                            attrValString += " " + key;
                            if (this.attrVals[key] !== null) {
                                attrValString += "=" + "\"" + this.attrVals[key] + "\"";
                            }
                        }
                        else if (contains(whitelist.HrefAttributes, key)) {
                            attrValString += " " + key;
                            if (this.attrVals[key] !== null) {
                                attrValString += "=" + "\"" + xssFilters.uriInDoubleQuotedAttr(decodeURI(this.attrVals[key])) + "\"";   
                            }
                        }
                        else if (key === "style") {// TODO: move style to a const
                            if (this.attrVals[key] === null) {
                                attrValString += " " + key + "=" + "\"\"";
                            }
                            else if (this.cssParser.parseCssString(this.attrVals[key])) {
                                attrValString += " " + key + "=" + "\"" + this.attrVals[key] + "\"";
                            }
                        }
                    }

                    // handle self-closing tags
                    this.output += "<" + tagName + attrValString + (this.hasSelfClosing ? ' />' : '>');

                }
            }
            // reinitialize once tag has been written to output
            this.attrVals = {};
            this.hasSelfClosing = 0;
            break;

        case derivedState.TransitionName.ATTR_TO_AFTER_ATTR:
            this.attrVals[parser.getAttributeName()] = null;
            break;

        case derivedState.TransitionName.ATTR_VAL_TO_AFTER_ATTR_VAL:
            this.attrVals[parser.getAttributeName()] = parser.getAttributeValue() || '';
            break;

        case derivedState.TransitionName.TAG_OPEN_TO_MARKUP_OPEN:
            this.output += "<" + parser.input[i];
            break;

        case derivedState.TransitionName.TO_SELF_CLOSING_START:
            // boolean attributes may not have a value
            if (prevState === 35) {
                this.attrVals[parser.getAttributeName()] = parser.getAttributeValue();
            }
            this.hasSelfClosing = 1;
            break;
        }
    }

    Purifier.prototype.purify = function (data) {
        var that = this, openedTag;

        that.output = '';
        that.openedTags = [];
        that.attrVals = {};
        that.hasSelfClosing = 0;

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

},{"./derived-states.js":13,"./tag-attr-list":15,"context-parser":1,"css-js":7,"xss-filters":12}],15:[function(require,module,exports){
/*
Copyright 2015, Yahoo Inc. 
Copyrights licensed under the New BSD License.
See the accompanying LICENSE file for terms.
*/

// The tags and attributes listed here are based on http://facebook.github.io/react/docs/tags-and-attributes.html
// For uri attributes such as background, cite, href, longdesc, src, usemap (not whitelisted so far), we can potentially use https://git.corp.yahoo.com/paranoids/xss-filters
var Whitelist = {};

Whitelist.Tags = [
    "a",
    "abbr",
    "address",
    "area",
    "article",
    "aside",
    "audio",
    "b",
    "base",
    "bdi",
    "bdo",
    "big",
    "blockquote",
    "body",
    "br",
    "button",
    "canvas",
    "caption",
    "cite",
    "code",
    "col",
    "colgroup",
    "data",
    "datalist",
    "dd",
    "del",
    "details",
    "dfn",
    "dialog",
    "div",
    "dl",
    "dt",
    "em",
    "embed",
    "fieldset",
    "figcaption",
    "figure",
    "footer",
    "form",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "head",
    "header",
    "hr",
    "html",
    "i",
    "iframe",
    "img",
    "input",
    "ins",
    "kbd",
    "keygen",
    "label",
    "legend",
    "li",
    "link",
    "main",
    "map",
    "mark",
    "menu",
    "menuitem",
    "meta",
    "meter",
    "nav",
    "noscript",
    "object",
    "ol",
    "optgroup",
    "option",
    "output",
    "p",
    "param",
    "picture",
    "pre",
    "progress",
    "q",
    "rp",
    "rt",
    "ruby",
    "s",
    "samp",
    "section",
    "select",
    "small",
    "source",
    "span",
    "strong",
    "sub",
    "summary",
    "sup",
    "table",
    "tbody",
    "td",
    "textarea",
    "tfoot",
    "th",
    "thead",
    "time",
    "title",
    "tr",
    "track",
    "u",
    "ul",
    "var",
    "video",
    "wbr"
];

Whitelist.Attributes = [
    "ept",
    "acceptCharset",
    "accessKey",
    "action",
    "allowFullScreen",
    "allowTransparency",
    "alt",
    "async",
    "autoComplete",
    "autoFocus",
    "autoPlay",
    "cellPadding",
    "cellSpacing",
    "charSet",
    "checked",
    "classID",
    "className",
    "cols",
    "colSpan",
    "content",
    "contentEditable",
    "contextMenu",
    "controls",
    "coords",
    "crossOrigin",
    "data",
    "dateTime",
    "defer",
    "dir",
    "disabled",
    "download",
    "draggable",
    "encType",
    "form",
    "formAction",
    "formEncType",
    "formMethod",
    "formNoValidate",
    "formTarget",
    "frameBorder",
    "height",
    "hidden",
    "hrefLang",
    "htmlFor",
    "httpEquiv",
    "id",
    "label",
    "lang",
    "list",
    "loop",
    "manifest",
    "marginHeight",
    "marginWidth",
    "max",
    "maxLength",
    "media",
    "mediaGroup",
    "method",
    "min",
    "multiple",
    "muted",
    "name",
    "noValidate",
    "open",
    "pattern",
    "placeholder",
    "poster",
    "preload",
    "radioGroup",
    "readOnly",
    "rel",
    "required",
    "role",
    "rows",
    "rowSpan",
    "sandbox",
    "scope",
    "scrolling",
    "seamless",
    "selected",
    "shape",
    "size",
    "sizes",
    "span",
    "spellCheck",
    "srcDoc",
    "srcSet",
    "start",
    "step",
    "tabIndex",
    "target",
    "title",
    "type",
    "value",
    "width",
    "wmode"
];

Whitelist.HrefAttributes = [
    "action",
    "background",
    "codebase",
    "cite",
    "classid",
    "formaction",
    "folder",
    "href",
    "icon",
    "longdesc",
    "manifest",
    "profile",
    "poster",
    "src",
    "usemap",
    "xlink:href"
];

// Void elements only have a start tag; end tags must not be specified for void elements.
// https://html.spec.whatwg.org/multipage/syntax.html#void-elements
Whitelist.VoidElements = {"area":1, "base":1, "br":1, "col":1, "embed":1, "hr":1, "img":1, "input":1, "keygen":1, "link":1, "menuitem":1, "meta":1, "param":1, "source":1, "track":1, "wbr":1};

module.exports = Whitelist;

},{}]},{},[14])(14)
});
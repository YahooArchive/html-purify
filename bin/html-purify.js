#!/usr/bin/env node
/*
Copyright 2015, Yahoo Inc. 
Copyrights licensed under the New BSD License.
See the accompanying LICENSE file for terms.
*/

/*
This utility prints out sanitized html content
*/
var Debug = require("debug"),
    progname = 'HTML-Purifier';
var Purifier = require('../src/html-purify');

Debug.enable(progname);

(function() {
    var fs = require('fs'),
    file,
    lineByLine = 0,
    noofargs = 0;

    process.argv.forEach(function(val, index) {
        ++noofargs;
        if (index === 2) {
            file = val;
        }
	if (index === 3) {
            if (val === "-l") {
	        lineByLine = 1;
	    }
	}
    });

    if (noofargs >= 3) {
        if (fs.existsSync(file)) {
            var data = fs.readFileSync(file, 'utf-8');
	    	var i;
	    	var output = '';
	    	if (lineByLine) {
	        	// reading and processing line by line
	        	var data2 = data.split(/\n/);
	        	for (i = 0; i < data2.length; i++) {
		    		if (data2[i].length !== 0) {
	                	output = (new Purifier()).purify(data2[i]);
		        		console.log("*****");
	                	console.log("input  ==> " + data2[i]);
	                	console.log("output ==> " + output);
		    		}
				}

	    	} else {
				var start = +new Date();
				output = (new Purifier()).purify(data);
	    		/*for (i = 0; i < 100; i++) {
	        		output = (new Purifier()).purify(data);
	    		}*/	
				var end = +new Date();
	    		console.log(output);
				//console.log("html-purify runs at a speed of " + 10/((end - start)/1000) + " MB per seconds [" + (end-start)/10/1000 + " second per MB].");
	    	}
	    process.exit(0);
	} else {
		console.log("[ERROR] "+file+" not exist");
		process.exit(1);
	}
    } else {
	    console.log("Usage: html-purify <any html file>");
	    process.exit(1);
    }

}).call(this);

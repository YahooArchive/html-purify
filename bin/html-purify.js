#!/usr/bin/env node
/*
Copyright 2015, Yahoo Inc. 
Copyrights licensed under the New BSD License.
See the accompanying LICENSE file for terms.
*/

/*
This utility prints out sanitized html content
*/
var Purifier = require('../src/html-purify'),
    Benchmark = require('benchmark');

(function() {
    var fs = require('fs'),
        file,
        // lineByLine = false,
        benchmark = false,
        noofargs = process.argv.length;

    process.argv.forEach(function(val, index) {
        if (index === 2) {
            file = val;
        } else if (index === 3) {
            if (val === "--benchmark") {
                benchmark = true;
            }
            // else if (val === "-l") {
            //     lineByLine = true;
            // }
        }
    });


    if (noofargs < 3) {
        console.log("Usage: html-purifier <html_filepath> [--benchmark]");
        process.exit(1);
    }

    if (!fs.existsSync(file)) {
        console.log("[ERROR] "+file+" not exist");
        process.exit(1);
    }

    var data = fs.readFileSync(file, 'utf-8'), i, output = '';

    // The following is disabled as it might generate insecure html, 
    // as it could violate the assumption that purify() must start with the data state
    // if (lineByLine) {
    //     // reading and processing line by line
    //     var data2 = data.split(/\n/);
    //     for (i = 0; i < data2.length; i++) {
    //         if (data2[i].length !== 0) {
    //             output = (new Purifier()).purify(data2[i]);
    //             console.log("*****");
    //             console.log("input  ==> " + data2[i]);
    //             console.log("output ==> " + output);
    //         }
    //     }
    //     process.exit(0);
    // }

    if (!benchmark) {
        console.log((new Purifier()).purify(data));
        process.exit(0);
    } 
    else if (benchmark) {

        var suite = new Benchmark.Suite;
        var purifier1a = new Purifier();
        var purifier1b = new Purifier({enableTagBalancing:false});

        suite.add('default', function() {
            purifier1a.purify(data);
        })
        .add('disabled tag balancing', function() {
            purifier1b.purify(data);
        })
        // add listeners
        .on('cycle', function(event) {
            console.log(String(event.target));
        })
        .on('complete', function() {
            console.log('Fastest is     ', this.filter('fastest').pluck('name'));

            var t = this.filter('fastest')[0].stats.mean;
            console.log('Speed/Time is  ', data.length/1000000/t + 'MB/s', t + 's');
        })
        // run async
        .run({
            // 'minSamples': 10,
            'async': true
        });
    }

}).call(this);

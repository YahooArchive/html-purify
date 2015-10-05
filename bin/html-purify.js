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
        benchmark = false,
        argv = process.argv;

    // pick up the parameters
    switch (argv.length) {
        case 4:
            benchmark = argv[3] === '--benchmark';
        case 3: 
            file = argv[2];
        break;
        default:
            console.log("Usage: html-purifier <html_filepath> [--benchmark]");
            process.exit(1);
            return;
    }

    // read the given file path for processing
    fs.readFile(file, 'utf8', function (err, data) {
        if (err) {
            throw err;
        }

        // print the processed file
        if (!benchmark) {
            console.log((new Purifier()).purify(data));
            return;
        }

        // benchmarking
        console.log('Benchmarking...');
        var suite = new Benchmark.Suite;
        var purifier1a = new Purifier();
        // var purifier1b = new Purifier({enableTagBalancing:false});

        suite.add('default', function() {
            purifier1a.purify(data);
        })
        // .add('disabled tag balancing', function() {
        //     purifier1b.purify(data);
        // })
        .on('cycle', function(event) {
            console.log(String(event.target));
        })
        .on('complete', function() {
            console.log('Fastest is     ', this.filter('fastest').pluck('name'));

            var t = this.filter('fastest')[0].stats.mean;
            console.log('Speed/Time is  ', data.length/1000000/t + 'MB/s', t + 's');
        })
        .run({
            // 'minSamples': 10,
            'async': true
        });
    });

}).call(this);

/*
* Copyright 2015, Yahoo Inc. 
* Copyrights licensed under the New BSD License.
* See the accompanying LICENSE file for terms.
*/
module.exports = function(grunt) {

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    jshint: {
      files: ['src/*.js'],
      options: {
        scripturl: true,
        camelcase: true
      }
    },
    mocha_istanbul: {
      coverage: {
        src: 'tests/unit',
        options: {
          coverageFolder: 'artifacts/test/coverage',
          check: {
            lines: 80,
            statements: 80
          },
          timeout: 10000
        }
      },
      target: {
        src: 'tests/unit'
      }
    },
    browserify: {
      standalone: {
        src: 'src/<%= pkg.name %>.js',
        dest: 'dist/<%= pkg.name %>.js',
        options: {
          browserifyOptions: {
            standalone: 'Purifier'
          }
        }
      },
    },
    uglify: {
      options: {
        banner: ['/**',
            ' * <%= pkg.name %> - v<%= pkg.version %>',
            ' * Yahoo! Inc. Copyrights licensed under the New BSD License. See the accompanying LICENSE file for terms.',
            ' */', ''].join('\n'),
        compress: {
          join_vars: true
        }
      },
      buildMin: {
        src: ['dist/<%= pkg.name %>.js'],
        dest: 'dist/<%= pkg.name %>.min.js'
      }
    },
    clean: {
      all: ['node_modules', 'artifacts'],
      buildResidues: ['artifacts']
    }
  });

  grunt.loadNpmTasks('grunt-mocha-istanbul');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-contrib-uglify');

  grunt.registerTask('test', ['jshint', 'clean:buildResidues', 'mocha_istanbul:coverage']);
  grunt.registerTask('unittest', ['jshint', 'clean:buildResidues', 'mocha_istanbul:target']);

  grunt.registerTask('default', ['test', 'browserify', 'uglify']);

};

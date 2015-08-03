/*
Copyright 2015, Yahoo Inc. 
Copyrights licensed under the New BSD License.
See the accompanying LICENSE file for terms.
*/

(function() {
// List of vectors from https://html5sec.org/
var html5secVectors = [
{
	id: 1,
	input:  "<form id=\"test\"></form><button form=\"test\" formaction=\"javascript:alert(1)\">X</button>",
	output: "<form id=\"test\"></form><button form=\"test\" formaction=\"x-javascript:alert(1)\">X</button>"
},
{
	id: 2,
	input:  "<meta charset=\"x-imap4-modified-utf7\">&ADz&AGn&AG0&AEf&ACA&AHM&AHI&AGO&AD0&AGn&ACA&AG8Abg&AGUAcgByAG8AcgA9AGEAbABlAHIAdAAoADEAKQ&ACAAPABi",
	output: "<meta charset=\"x-imap4-modified-utf7\" />&ADz&AGn&AG0&AEf&ACA&AHM&AHI&AGO&AD0&AGn&ACA&AG8Abg&AGUAcgByAG8AcgA9AGEAbABlAHIAdAAoADEAKQ&ACAAPABi"
},
{
	id: 3,
	input: "<meta charset=\"x-imap4-modified-utf7\">&<script&S1&TS&1>alert&A7&(1)&R&UA;&&<&A9&11/script&X&>",
	output: "<meta charset=\"x-imap4-modified-utf7\" />&alert&A7&(1)&R&UA;&&&lt;&A9&11/script&X&>"
},
{
	id: 4,
	input: "0?<script>Worker(\"#\").onmessage=function(_)eval(_.data)</script> :postMessage(importScripts(\'data:;base64,cG9zdE1lc3NhZ2UoJ2FsZXJ0KDEpJyk\'))",
	output: "0? :postMessage(importScripts(\'data:;base64,cG9zdE1lc3NhZ2UoJ2FsZXJ0KDEpJyk\'))"
},
{
	id: 5,
	input: "<script>crypto.generateCRMFRequest(\'CN=0\',0,0,null,\'alert(1)\',384,null,\'rsa-dual-use\')</script>",
	output: ""
},
{
	id: 6,
	input: "<script>({set/**/$($){_/**/setter=$,_=1}}).$=alert</script>",
	output: ""
},
{
	id: 7,
	input: "<input onfocus=write(1) autofocus>",
	output: "<input autofocus />"
},
{
	id: 8,
	input: "<input onblur=write(1) autofocus><input autofocus>",
	output: "<input autofocus /><input autofocus />"
},
{
	id: 9,
	input: "<a style=\"-o-link:\'javascript:alert(1)\';-o-link-source:current\">X</a>",
	output: "<a style=\"-o-link:\'javascript:alert(1)\';-o-link-source:current\">X</a>"
},
{
	id: 10,
	input: "<video poster=javascript:alert(1)//></video>",
	output: "<video poster=\"x-javascript:alert(1)//\"></video>"
},
{
	id: 11,
	input: "<svg xmlns=\"http://www.w3.org/2000/svg\"><g onload=\"javascript:alert(1)\"></g></svg>",
	output: ""
},
{
	id: 12,
	input: "<body onscroll=alert(1)><br><br><br><br><br><br>...<br><br><br><br><input autofocus>",
	output: "<body><br /><br /><br /><br /><br /><br />...<br /><br /><br /><br /><input autofocus /></body>"
},
{
	id: 13,
	input: "<x repeat=\"template\" repeat-start=\"999999\">0<y repeat=\"template\" repeat-start=\"999999\">1</y></x>",
	output: "01"
},
{
	id: 14,
	input: "<input pattern=^((a+.)a)+$ value=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!>",
	output: "<input pattern=\"^((a+.)a)+$\" value=\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!\" />"
},
{
	id: 15,
	input: "<script>({0:#0=alert/#0#/#0#(0)})</script>",
	output: ""
},
{
	id: 16,
	input: "X<x style=`behavior:url(#default#time2)` onbegin=`write(1)` >",
	output: "X"
},
{
	id: 17,
	input: "<?xml-stylesheet href=\"javascript:alert(1)\"?><root/>",
	output: ""
},
{
	id: 18,
	input: "<script xmlns=\"http://www.w3.org/1999/xhtml\">&#x61;l&#x65;rt&#40;1)</script>",
	output: ""
},
{
	id: 19,
	input: "<meta charset=\"x-mac-farsi\">\xBCscript \xBEalert(1)//\xBC/script \xBE",
	output: "<meta charset=\"x-mac-farsi\" />\xBCscript \xBEalert(1)//\xBC/script \xBE"
},
{
	id: 20,
	input: "<script>ReferenceError.prototype.__defineGetter__(\'name\', function(){alert(1)}),x</script>",
	output: ""
},
{
	id: 21,
	input: "<script>Object.__noSuchMethod__ = Function,[{}][0].constructor._(\'alert(1)\')()</script>",
	output: ""
},
{
	id: 22,
	input: "<input onblur=focus() autofocus><input>",
	output: "<input autofocus /><input />"
},
{
	id: 23,
	input: "<form id=test onforminput=alert(1)><input></form><button form=test onformchange=alert(2)>X</button>",
	output: "<form id=\"test\"><input /></form><button form=\"test\">X</button>"
},
{
	id: 24,
	input: "1<set/xmlns=`urn:schemas-microsoft-com:time` style=`beh&#x41vior:url(#default#time2)` attributename=`innerhtml` to=`&lt;img/src=&quot;x&quot;onerror=alert(1)&gt;`>",
	output: "1"
},
{
	id: 25,
	input: "<script src=\"#\">{alert(1)}</script>;1",
	output: ";1"
},
{
	id: 26,
	input: "+ADw-html+AD4APA-body+AD4APA-div+AD4-top secret+ADw-/div+AD4APA-/body+AD4APA-/html+AD4-.toXMLString().match(/.*/m),alert(RegExp.input);",
	output: "+ADw-html+AD4APA-body+AD4APA-div+AD4-top secret+ADw-/div+AD4APA-/body+AD4APA-/html+AD4-.toXMLString().match(/.*/m),alert(RegExp.input);"
},
{
	id: 27,
	input: "<style>p[foo=bar{}*{-o-link:\'javascript:alert(1)\'}{}*{-o-link-source:current}*{background:red}]{background:green};</style>",
	output: ""
},
{
	id: 28,
	input: "1<animate/xmlns=urn:schemas-microsoft-com:time style=behavior:url(#default#time2) attributename=innerhtml values=&lt;img/src=&quot;.&quot;onerror=alert(1)&gt;>",
	output: "1"
},
{
	id: 29,
	input: "<link rel=stylesheet href=data:,*%7bx:expression(write(1))%7d",
	output: ""
},
{
	id: 30,
	input: "<style>@import \"data:,*%7bx:expression(write(1))%7D\";</style>",
	output: ""
},
{
	id: 31,
	input: "<frameset onload=alert(1)>",
	output: ""
},
{
	id: 32,
	input: "<table background=\"javascript:alert(1)\"></table>",
	output: "<table background=\"x-javascript:alert(1)\"></table>"
},
{
	id: 33,
	input: "<a style=\"pointer-events:none;position:absolute;\"><a style=\"position:absolute;\" onclick=\"alert(1);\">XXX</a></a><a href=\"javascript:alert(2)\">XXX</a>",
	output: "<a style=\"pointer-events:none;position:absolute;\"><a style=\"position:absolute;\">XXX</a></a><a href=\"x-javascript:alert(2)\">XXX</a>"
},
{
	id: 34,
	input: "1<vmlframe xmlns=urn:schemas-microsoft-com:vml style=behavior:url(#default#vml);position:absolute;width:100%;height:100% src=test.vml#xss></vmlframe>",
	output: "1"
},
{
	id: 35,
	input: "1<a href=#><line xmlns=urn:schemas-microsoft-com:vml style=behavior:url(#default#vml);position:absolute href=javascript:alert(1) strokecolor=white strokeweight=1000px from=0 to=1000 /></a>",
	output: "1<a href=\"#\"></a>"
},
{
	id: 36,
	input: "<a style=\"behavior:url(#default#AnchorClick);\" folder=\"javascript:alert(1)\">XXX</a>",
	output: "<a style=\"behavior:url(#default#AnchorClick);\" folder=\"x-javascript:alert(1)\">XXX</a>"
},
{
	id: 37,
	input: "<!--<img src=\"--><img src=x onerror=alert(1)//\">",
	output: "<img src=\"x\" />"
},
{
	id: 38,
	input: "<comment><img src=\"</comment><img src=x onerror=alert(1)//\">",
	output: "<img src=\"%3C/comment%3E%3Cimg%20src=x%20onerror=alert(1)//\" />"
},
{ 
	id: 39, // TODO: confirm (this and certain doctype, xml ones)
	input: "<!-- up to Opera 11.52, FF 3.6.28 -->\r\n<![><img src=\"]><img src=x onerror=alert(1)//\">\r\n\r\n<!-- IE9+, FF4+, Opera 11.60+, Safari 4.0.4+, GC7+ -->\r\n<svg><![CDATA[><image xlink:href=\"]]><img src=xx:x onerror=alert(2)//\"></svg>",
	output: "\n<img src=\"%5D%3E%3Cimg%20src=x%20onerror=alert(1)//\" />\n\n\n"
},
{
	id: 40,
	input: "<style><img src=\"</style><img src=x onerror=alert(1)//\">",
	output: "<img src=\"x\" />"
},
{
	id: 41,
	input: "<li style=list-style:url() onerror=alert(1)></li>\n<div style=content:url(data:image/svg+xml,%3Csvg/%3E);visibility:hidden onload=alert(1)></div>",
	output: "<li style=\"list-style:url()\"></li>\n<div style=\"content:url(data:image/svg+xml,%3Csvg/%3E);visibility:hidden\"></div>"
},
{
	id: 42,
	input: "<head><base href=\"javascript://\"/></head><body><a href=\"/. /,alert(1)//#\">XXX</a></body>",
	output: "<head><base href=\"x-javascript://\" /></head><body><a href=\"/.%20/,alert(1)//#\">XXX</a></body>"
},
{
	id: 43,
	input: "<?xml version=\"1.0\" standalone=\"no\"?>\r\n<html xmlns=\"http://www.w3.org/1999/xhtml\">\r\n<head>\r\n<style type=\"text/css\">\r\n@font-face {font-family: y; src: url(\"font.svg#x\") format(\"svg\");} body {font: 100px \"y\";}\r\n</style>\r\n</head>\r\n<body>Hello</body>\r\n</html>",
	output: "\n<html xmlns=\"http://www.w3.org/1999/xhtml\">\n<head>\n\n</head>\n<body>Hello</body>\n</html>"
},
{
	id: 45,
	input: "<style>*[{}@import\'test.css?]{color: green;}</style>X",
	output: "X"
},
{
	id: 46,
	input: "<div style=\"font-family:\'foo[a];color:red;\';\">XXX</div>",
	output: "<div style=\"font-family:\'foo[a];color:red;\';\">XXX</div>"
},
{
	id: 47,
	input: "<div style=\"font-family:foo}color=red;\">XXX</div>",
	output: "<div>XXX</div>"
},
{
	id: 48,
	input: "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>",
	output: ""
},
{
	id: 49,
	input: "<SCRIPT FOR=document EVENT=onreadystatechange>alert(1)</SCRIPT>",
	output: ""
},
{
	id: 50,
	input: "<OBJECT CLASSID=\"clsid:333C7BC4-460F-11D0-BC04-0080C7055A83\"><PARAM NAME=\"DataURL\" VALUE=\"javascript:alert(1)\"></OBJECT>",
	output: "<object classid=\"clsid:333C7BC4-460F-11D0-BC04-0080C7055A83\"><param name=\"DataURL\" value=\"javascript:alert(1)\" /></object>"
},
{
	id: 51,
	input: "<object data=\"data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==\"></object>",
	output: "<object data=\"data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==\"></object>"
},
{
	id: 52,
	input: "<embed src=\"data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==\"></embed>",
	output: "<embed src=\"x-data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==\" />"
},
{
	id: 53,
	input: "<x style=\"behavior:url(test.sct)\">",
	output: ""
},
{
	id: 54,
	input: "<xml id=\"xss\" src=\"test.htc\"></xml>\r\n<label dataformatas=\"html\" datasrc=\"#xss\" datafld=\"payload\"></label>",
	output: "\n<label></label>"
},
{
	id: 55,
	input: "<script>[{\'a\':Object.prototype.__defineSetter__(\'b\',function(){alert(arguments[0])}),\'b\':[\'secret\']}]</script>",
	output: ""
},
{
	id: 56,
	input: "<video><source onerror=\"alert(1)\">",
	output: "<video><source /></video>"
},
{
	id: 57,
	input: "<video onerror=\"alert(1)\"><source></source></video>",
	output: "<video><source /></video>"
},
{
	id: 58,
	input: "<b <script>alert(1)//</script>0</script></b>",
	output: "<b>alert(1)//0</b>"
},
{
	id: 59,
	input: "<b><script<b></b><alert(1)</script </b></b>",
	output: "<b></b>"
},
{
	id: 60,
	input: "<div id=\"div1\"><input value=\"``onmouseover=alert(1)\"></div> <div id=\"div2\"></div><script>document.getElementById(\"div2\").innerHTML = document.getElementById(\"div1\").innerHTML;</script>",
	output: "<div id=\"div1\"><input value=\"``onmouseover=alert(1)\" /></div> <div id=\"div2\"></div>"
},
{
	id: 61,
	input: "<div style=\"[a]color[b]:[c]red\">XXX</div>",
	output: "<div>XXX</div>"
},
{
	id: 62,
	input: "<div style=\"\\63&#9\\06f&#10\\0006c&#12\\00006F&#13\\R:\\000072 Ed;color\\0\\bla:yellow\\0\\bla;col\\0\\00 \\&#xA0or:blue;\">XXX</div>",
	output: "<div>XXX</div>"
},
{
	id: 63,
	input: "<!-- IE 6-8 -->\r\n<x \'=\"foo\"><x foo=\'><img src=x onerror=alert(1)//\'>\r\n\r\n<!-- IE 6-9 -->\r\n<! \'=\"foo\"><x foo=\'><img src=x onerror=alert(2)//\'>\r\n<? \'=\"foo\"><x foo=\'><img src=x onerror=alert(3)//\'>",
	output: "\n\n\n\n\n"
},
{
	id: 64,
	input: "<embed src=\"javascript:alert(1)\"></embed> // O10.10â†“, OM10.0â†“, GC6â†“, FF\r\n<img src=\"javascript:alert(2)\">\r\n<image src=\"javascript:alert(2)\"> // IE6, O10.10â†“, OM10.0â†“\r\n<script src=\"javascript:alert(3)\"></script> // IE6, O11.01â†“, OM10.1â†“",
	output: "<embed src=\"x-javascript:alert(1)\" /> // O10.10â†“, OM10.0â†“, GC6â†“, FF\n<img src=\"x-javascript:alert(2)\" />\n // IE6, O10.10â†“, OM10.0â†“\n // IE6, O11.01â†“, OM10.1â†“"
},
{
	id: 65,
	input: "<!DOCTYPE x[<!ENTITY x SYSTEM \"http://htmlsec.org/test.xxe\">]><y>&x;</y>",
	output: "]>&x;"
},
{
	id: 66,
	input: "<svg onload=\"javascript:alert(1)\" xmlns=\"http://www.w3.org/2000/svg\"></svg>",
	output: ""
},
{
	id: 67,
	input: "<?xml version=\"1.0\"?>\n<?xml-stylesheet type=\"text/xsl\" href=\"data:,%3Cxsl:transform version=\'1.0\' xmlns:xsl=\'http://www.w3.org/1999/XSL/Transform\' id=\'xss\'%3E%3Cxsl:output method=\'html\'/%3E%3Cxsl:template match=\'/\'%3E%3Cscript%3Ealert(1)%3C/script%3E%3C/xsl:template%3E%3C/xsl:transform%3E\"?>\n<root/>",
	output: "\n\n"
},
{
	id: 68,
	input: "<!DOCTYPE x [\r\n\t<!ATTLIST img xmlns CDATA \"http://www.w3.org/1999/xhtml\" src CDATA \"xx:x\"\r\n onerror CDATA \"alert(1)\"\r\n onload CDATA \"alert(2)\">\r\n]><img />",
	output: "\n]><img />"
},
{
	id: 69,
	input: "<doc xmlns:xlink=\"http://www.w3.org/1999/xlink\" xmlns:html=\"http://www.w3.org/1999/xhtml\">\r\n\t<html:style /><x xlink:href=\"javascript:alert(1)\" xlink:type=\"simple\">XXX</x>\r\n</doc>",
	output: "\n\tXXX\n"
},
{
	id: 70,
	input: "<card xmlns=\"http://www.wapforum.org/2001/wml\"><onevent type=\"ontimer\"><go href=\"javascript:alert(1)\"/></onevent><timer value=\"1\"/></card>",
	output: ""
},
{
	id: 71,
	input: "<div style=width:1px;filter:glow onfilterchange=alert(1)>x</div>",
	output: "<div style=\"width:1px;filter:glow\">x</div>"
},
{
	id: 72,
	input: "<// style=x:expression\\28write(1)\\29>",
	output: ""
},
{
	id: 73,
	input: "<form><button formaction=\"javascript:alert(1)\">X</button>",
	output: "<form><button formaction=\"x-javascript:alert(1)\">X</button></form>"
},
{
	id: 74,
	input: "<event-source src=\"event.php\" onload=\"alert(1)\">",
	output: ""
},
{
	id: 75,
	input: "<a href=\"javascript:alert(1)\"><event-source src=\"data:application/x-dom-event-stream,Event:click%0Adata:XXX%0A%0A\" /></a>",
	output: "<a href=\"x-javascript:alert(1)\"></a>"
},
{
	id: 76,
	input: "<script<{alert(1)}/></script </>",
	output: ""
},
{
	id: 77,
	input: "<?xml-stylesheet type=\"text/css\"?><!DOCTYPE x SYSTEM \"test.dtd\"><x>&x;</x>",
	output: "&x;"
},
{
	id: 78,
	input: "<?xml-stylesheet type=\"text/css\"?><root style=\"x:expression(write(1))\"/>",
	output: ""
},
{
	id: 79,
	input: "<?xml-stylesheet type=\"text/xsl\" href=\"#\"?><img xmlns=\"x-schema:test.xdr\"/>",
	output: "<img xmlns=\"x-x-schema:test.xdr\" />"
},
{
	id: 80,
	input: "<object allowscriptaccess=\"always\" data=\"test.swf\"></object>",
	output: "<object data=\"test.swf\"></object>"
},
{
	id: 81,
	input: "<style>*{x:ï½…ï½˜ï½ï½’ï½…ï½“ï½“ï½‰ï½ï½Ž(write(1))}</style>",
	output: ""
},
{
	id: 82,
	input: "<x xmlns:xlink=\"http://www.w3.org/1999/xlink\" xlink:actuate=\"onLoad\" xlink:href=\"javascript:alert(1)\" xlink:type=\"simple\"/>",
	output: ""
},
{
	id: 83,
	input: "<?xml-stylesheet type=\"text/css\" href=\"data:,*%7bx:expression(write(2));%7d\"?>",
	output: ""
},
{
	id: 84,
	input: "<x:template xmlns:x=\"http://www.wapforum.org/2001/wml\" x:ontimer=\"$(x:unesc)j$(y:escape)a$(z:noecs)v$(x)a$(y)s$(z)cript$x:alert(1)\"><x:timer value=\"1\"/></x:template>",
	output: ""
},
{
	id: 85,
	input: "<x xmlns:ev=\"http://www.w3.org/2001/xml-events\" ev:event=\"load\" ev:handler=\"javascript:alert(1)//#x\"/>",
	output: ""
},
{
	id: 86,
	input: "<x xmlns:ev=\"http://www.w3.org/2001/xml-events\" ev:event=\"load\" ev:handler=\"test.evt#x\"/>",
	output: ""
},
{
	id: 87,
	input: "<body oninput=alert(1)><input autofocus>",
	output: "<body><input autofocus /></body>"
},
{
	id: 88,
	input: "<svg xmlns=\"http://www.w3.org/2000/svg\">\n<a xmlns:xlink=\"http://www.w3.org/1999/xlink\" xlink:href=\"javascript:alert(1)\"><rect width=\"1000\" height=\"1000\" fill=\"white\"/></a>\n</svg>",
	output: "\n<a xmlns:xlink=\"http://www.w3.org/1999/xlink\" xlink:href=\"x-javascript:alert(1)\"></a>\n"
},
{
	id: 89,
	input: "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\">\n\n<animation xlink:href=\"javascript:alert(1)\"/>\n<animation xlink:href=\"data:text/xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' onload=\'alert(1)\'%3E%3C/svg%3E\"/>\n\n<image xlink:href=\"data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' onload=\'alert(1)\'%3E%3C/svg%3E\"/>\n\n<foreignObject xlink:href=\"javascript:alert(1)\"/>\n<foreignObject xlink:href=\"data:text/xml,%3Cscript xmlns=\'http://www.w3.org/1999/xhtml\'%3Ealert(1)%3C/script%3E\"/>\n\n</svg>",
	output: "\n\n\n\n\n\n\n\n\n\n"
},
{
	id: 90,
	input: "<svg xmlns=\"http://www.w3.org/2000/svg\">\n<set attributeName=\"onmouseover\" to=\"alert(1)\"/>\n<animate attributeName=\"onunload\" to=\"alert(1)\"/>\n</svg>",
	output: "\n\n\n"
},
{
	id: 91,
	input: "<!-- Up to Opera 10.63 -->\r\n<div style=content:url(test2.svg)></div>\r\n\r\n<!-- Up to Opera 11.64 - see link below -->\r\n\r\n<!-- Up to Opera 12.x -->\r\n<div style=\"background:url(test5.svg)\">PRESS ENTER</div>",
	output: "\n<div style=\"content:url(test2.svg)\"></div>\n\n\n\n\n<div style=\"background:url(test5.svg)\">PRESS ENTER</div>"
},
{
	id: 92,
	input: "[A]\n<? foo=\"><script>alert(1)</script>\">\n<! foo=\"><script>alert(1)</script>\">\n</ foo=\"><script>alert(1)</script>\">\n[B]\n<? foo=\"><x foo=\'?><script>alert(1)</script>\'>\">\n[C]\n<! foo=\"[[[x]]\"><x foo=\"]foo><script>alert(1)</script>\">\n[D]\n<% foo><x foo=\"%><script>alert(1)</script>\">",
	output: "[A]\n\">\n\">\n\">\n[B]\n\">\n[C]\n\n[D]\n&lt;% foo>"
},
{
	id: 93,
	input: "<div style=\"background:url(http://foo.f/f oo/;color:red/*/foo.jpg);\">X</div>",
	output: "<div>X</div>"
},
{
	id: 94,
	input: "<div style=\"list-style:url(http://foo.f)\\20url(javascript:alert(1));\">X</div>",
	output: "<div>X</div>"
},
{
	id: 95,
	input: "<svg xmlns=\"http://www.w3.org/2000/svg\">\n<handler xmlns:ev=\"http://www.w3.org/2001/xml-events\" ev:event=\"load\">alert(1)</handler>\n</svg>",
	output: "\nalert(1)\n"
},
{
	id: 96,
	input: "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\">\n<feImage>\n<set attributeName=\"xlink:href\" to=\"data:image/svg+xml;charset=utf-8;base64,\nPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxzY3JpcHQ%2BYWxlcnQoMSk8L3NjcmlwdD48L3N2Zz4NCg%3D%3D\"/>\n</feImage>\n</svg>",
	output: "\n\n\n\n"
},
{
	id: 97,
	input: "<iframe src=mhtml:http://html5sec.org/test.html!xss.html></iframe>\n<iframe src=mhtml:http://html5sec.org/test.gif!xss.html></iframe>",
	output: "\n"
},
{
	id: 98,
	input: "<!-- IE 5-9 -->\r\n<div id=d><x xmlns=\"><iframe onload=alert(1)\"></div>\n<script>d.innerHTML+=\'\';</script>\r\n\r\n<!-- IE 10 in IE5-9 Standards mode -->\r\n<div id=d><x xmlns=\'\"><iframe onload=alert(2)//\'></div>\n<script>d.innerHTML+=\'\';</script>",
	output: "\n<div id=\"d\"></div>\n\n\n\n<div id=\"d\"></div>\n"
},
{
	id: 99,
	input: "<div id=d><div style=\"font-family:\'sans\\27\\2F\\2A\\22\\2A\\2F\\3B color\\3Ared\\3B\'\">X</div></div>\n<script>with(document.getElementById(\"d\"))innerHTML=innerHTML</script>",
	output: "<div id=\"d\"><div style=\"font-family:\'sans\\27\\2F\\2A\\22\\2A\\2F\\3B color\\3Ared\\3B\'\">X</div></div>\n"
},
{
	id: 100,
	input: "XXX<style>\r\n\r\n*{color:gre/**/en !/**/important} /* IE 6-9 Standards mode */\r\n\r\n<!--\r\n--><!--*{color:red} /* all UA */\r\n\r\n*{background:url(xx:x //**/\\red/*)} /* IE 6-7 Standards mode */\r\n\r\n</style>",
	output: "XXX"
},
{
	id: 101,
	input: "<img[a][b]src=x[d]onerror[c]=[e]\"alert(1)\">",
	output: ""
},
{
	id: 102,
	input: "<a href=\"[a]java[b]script[c]:alert(1)\">XXX</a>",
	output: "<a href=\"%5Ba%5Djava%5Bb%5Dscript%5Bc%5D:alert(1)\">XXX</a>"
},
{
	id: 103,
	input: "<img src=\"x` `<script>alert(1)</script>\"` `>",
	output: "<img src=\"x%60%20%60%3Cscript%3Ealert(1)%3C/script%3E\" />"
},
{
	id: 104,
	input: "<script>history.pushState(0,0,\'/i/am/somewhere_else\');</script>",
	output: ""
},
{
	id: 105,
	input: "<svg xmlns=\"http://www.w3.org/2000/svg\" id=\"foo\">\r\n<x xmlns=\"http://www.w3.org/2001/xml-events\" event=\"load\" observer=\"foo\" handler=\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%3Chandler%20xml%3Aid%3D%22bar%22%20type%3D%22application%2Fecmascript%22%3E alert(1) %3C%2Fhandler%3E%0A%3C%2Fsvg%3E%0A#bar\"/>\r\n</svg>",
	output: "\n\n"
},
{
	id: 106,
	input: "<iframe src=\"data:image/svg-xml,%1F%8B%08%00%00%00%00%00%02%03%B3)N.%CA%2C(Q%A8%C8%CD%C9%2B%B6U%CA())%B0%D2%D7%2F%2F%2F%D7%2B7%D6%CB%2FJ%D77%B4%B4%B4%D4%AF%C8(%C9%CDQ%B2K%CCI-*%D10%D4%B4%D1%87%E8%B2%03\"></iframe>",
	output: ""
},
{
	id: 107,
	input: "<img src onerror /\" \'\"= alt=alert(1)//\">",
	output: "<img src />"
},
{
	id: 108,
	input: "<title onpropertychange=alert(1)></title><title title=></title>",
	output: ""
},
{
	id: 109,
	input: "<!-- IE 5-8 standards mode -->\r\n<a href=http://foo.bar/#x=`y></a><img alt=\"`><img src=xx:x onerror=alert(1)></a>\">\r\n\r\n<!-- IE 5-9 standards mode -->\r\n<!a foo=x=`y><img alt=\"`><img src=xx:x onerror=alert(2)//\">\r\n<?a foo=x=`y><img alt=\"`><img src=xx:x onerror=alert(3)//\">",
	output: "\n<a href=\"http://foo.bar/#x&#61;&#96;y\"></a><img alt=\"`><img src=xx:x onerror=alert(1)></a>\" />\n\n\n<img alt=\"`><img src=xx:x onerror=alert(2)//\" />\n<img alt=\"`><img src=xx:x onerror=alert(3)//\" />"
},
{
	id: 110,
	input: "<svg xmlns=\"http://www.w3.org/2000/svg\">\n<a id=\"x\"><rect fill=\"white\" width=\"1000\" height=\"1000\"/></a>\n<rect fill=\"white\" style=\"clip-path:url(test3.svg#a);fill:url(#b);filter:url(#c);marker:url(#d);mask:url(#e);stroke:url(#f);\"/>\n</svg>",
	output: "\n<a id=\"x\"></a>\n\n"
},
{
	id: 111,
	input: "<svg xmlns=\"http://www.w3.org/2000/svg\">\r\n<path d=\"M0,0\" style=\"marker-start:url(test4.svg#a)\"/>\r\n</svg>",
	output: "\n\n"
},
{
	id: 112,
	input: "<div style=\"background:url(/f#[a]oo/;color:red/*/foo.jpg);\">X</div>",
	output: "<div style=\"background:url(/f#[a]oo/;color:red/*/foo.jpg);\">X</div>"
},
{
	id: 113,
	input: "<div style=\"font-family:foo{bar;background:url(http://foo.f/oo};color:red/*/foo.jpg);\">X</div>",
	output: "<div>X</div>"
},
{
	id: 114,
	input: "<div id=\"x\">XXX</div>\n<style>\n\n#x{font-family:foo[bar;color:green;}\n\n#y];color:red;{}\n\n</style>",
	output: "<div id=\"x\">XXX</div>\n"
},
{
	id: 115,
	input: "<x style=\"background:url(\'x[a];color:red;/*\')\">XXX</x>",
	output: "XXX"
}
];

var generalVectors = [
{	
	id: 1,
	input: "<script> do_evil1() </script>evil script 1",
	output: "evil script 1"
},
{
	id: 2,
	input: "<script > do_evil2() < /script></script>evil script 2",
	output: "evil script 2"
},
{
	id: 3,
	input: "<script>var x = 'fred\'s house'; var y=3;</script>script with escaped tick",
	output: "script with escaped tick"
},
{
	id: 4,
	input: "<barf />no such tag with space",
	output: "no such tag with space"
},
{
	id: 5,
	input: "abc   <b>def</b> ghi<bogus>jkl</bogus>x< 4 > whitespace test",
	output: "abc   <b>def</b> ghijklx&lt; 4 > whitespace test"
},
{
	id: 6,
	input: "<>empty tag<>",
	output: "&lt;>empty tag&lt;>"
},
{
	id: 7,
	input: "<hr noshade=''/>boolean tag with empty quoted value",
	output: "<hr />boolean tag with empty quoted value"
},
{
	id: 8,
	input: "<hr noshade=\"noshad\"/>boolean tag with bogus value",
	output: "<hr />boolean tag with bogus value"
},
{
	id: 9,
	input: "<hr noshade=noshader />boolean tag with bogus unquoted value",
	output: "<hr />boolean tag with bogus unquoted value"
},
{
	id: 10,
	input: "<table><tr bz/></table>normal tag made standalone with bogus trunc attr",
	output: "<table><tr /></table>normal tag made standalone with bogus trunc attr"
},
{
	id: 11,
	input: "<table><tr color/></table>normal tag made standalone with trunc attr bad val",
	output: "<table><tr /></table>normal tag made standalone with trunc attr bad val"
},
{
	id: 12,
	input: "< br/>standalone tag with space before",
	output: "&lt; br/>standalone tag with space before"
},
{
	id: 13,
	input: "<br/ >standalone tag with space after",
	output: "<br />standalone tag with space after"
},
{
	id: 14,
	input: "<table><tr size=\"4\"/></table>normal tag made standalone with value",
	output: "<table><tr size=\"4\" /></table>normal tag made standalone with value"
},
//style attribute tests
{
	id: 15,
	input: "<div style=3>number not string in style</div>",
	output: "<div>number not string in style</div>"
},
{
	id: 16,
	input: "<div style=\"bogus: red; boguscolor :  green\">prohibited style</div>",
	output: "<div style=\"bogus: red; boguscolor :  green\">prohibited style</div>"
},
{
	id: 17,
	input: "<div style=\" color: blue\">rodent 1 is ok</div>",
	output: "<div style=\" color: blue\">rodent 1 is ok</div>"
},
{
	id: 18,
	input: "<div style=' color: blue;'>rodent 2 is ok</div>",
	output: "<div style=\" color: blue;\">rodent 2 is ok</div>"
},
{
	id: 19,
	input: "<div style=' color: blue\";'>rodent 3 is malformed</div>",
	output: "<div>rodent 3 is malformed</div>"
},
{
	id: 20,
	input: "<div style=' color: blue '>rodent 4 is ok</div>",
	output: "<div style=\" color: blue \">rodent 4 is ok</div>"
},
{
	id: 21,
	input: "<div style=\" <script>do_evil();</script> \">script tags stripped</div>",
	output: "<div>script tags stripped</div>"
},
{
	id: 22,
	input: "<div style=\"\">null style attr</div>",
	output: "<div style=\"\">null style attr</div>"
},
{
	id: 23,
	input: "<div style=\":\">colon style attr</div>",
	output: "<div>colon style attr</div>"
},
{
	id: 24,
	input: "<div style=>no style value at all</div>",
	output: "<div style=\"\">no style value at all</div>"
},
{
	id: 25,
	input: "<div style=\"color blue\">colon not present</div>",
	output: "<div>colon not present</div>"
},
{
	id: 26,
	input: "<div style=\"color = blue\">punct not colon</div>",
	output: "<div>punct not colon</div>"
},
{
	id: 27,
	input: "<div style=\"color\">colon and attr missing</div>",
	output: "<div>colon and attr missing</div>"
},
{
	id: 28,
	input: "<div style=\"color:\">attr mising</div>",
	output: "<div>attr mising</div>"
},
{
	id: 29,
	input: "<div style=\"color\\\": blue\">escaped quote in attr isnt really escaped</div>",
	output: "<div>escaped quote in attr isnt really escaped</div>"
},
{
	id: 30,
	input: "<div style=\"color : blue\\\"\">escaped quote in val isnt really escaped</div>",
	output: "<div>escaped quote in val isnt really escaped</div>"
},
{
	id: 31,
	input: "<div style=color:blue>unquoted style attribute</div>",
	output: "<div style=\"color:blue\">unquoted style attribute</div>"
},
{
	id: 32,
	input: "<div style=\"color:green blue\">multiple values</div>",
	output: "<div style=\"color:green blue\">multiple values</div>"
},
{
	id: 33,
	input: "<div style=\"color:green bad( blue )\">parenthesis test 1</div>",
	output: "<div style=\"color:green bad( blue )\">parenthesis test 1</div>"
},
{
	id: 34,
	input: "<div style=\"color:bad( blue ) green\">parenthesis test 2</div>",
	output: "<div style=\"color:bad( blue ) green\">parenthesis test 2</div>"
},
{
	id: 35,
	input: "<div style=\"color:bad( blue green\">parenthesis test 3</div>",
	output: "<div>parenthesis test 3</div>"
},
{
	id: 36,
	input: "<div style=\"color:bad(( blue ) green ) green\">parenthesis test 4</div>",
	output: "<div>parenthesis test 4</div>"
},
{
	id: 37,
	input: "<div style=\"color:))))) green\">parenthesis test 5</div>",
	output: "<div>parenthesis test 5</div>"
},
{
	id: 38,
	input: "<img />",
	output: "<img />"
},
{
	id: 39,
	input: "<img id=\"foo\" />",
	output: "<img id=\"foo\" />"
},
{
	id: 40,
	input: "<option selected />",
	output: "<option selected />"
},
{
	id: 41,
	input:  "<img id=\"foo\" / src=\"bar.com\">",
	output: "<img id=\"foo\" src=\"bar.com\" />"
},
{
	id: 42,
	input: "<img/>",
	output: "<img />"
},
{
	id: 43,
	input: "<img id=\"foo\"/>",
	output: "<img id=\"foo\" />"
},
{
	id: 44,
	input: "<option selected/>",
	output: "<option selected />"
},
{
	id: 45,
	input: "<img id=\'foo\'/>",
	output: "<img id=\"foo\" />"
},
{
	id: 46,
	input: "<img id=\'foo\' />",
	output: "<img id=\"foo\" />"
},
{
	id: 47,
	input: "<img id=\"\" />",
	output: "<img id=\"\" />"
},
{
	id: 48,
	input: "<img id=\'\' />",
	output: "<img id=\"\" />"
},
{
	id: 49,
	// TODO: html-purified content is not designed for comment state
	input: " 123 --> abc", 
	output: " 123 --> abc"
},
{
	id: 50,
	input: "abc <!-- 123",
	output: "abc "
}
];

exports.html5secVectors = html5secVectors;
exports.generalVectors = generalVectors;

})();

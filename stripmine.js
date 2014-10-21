var fs = require('fs')
var urlparse = require('url').parse
var urlresolve = require('url').resolve
var path = require('path')
var request = require('request')
var CS = require('coffee-script')
CS.register()
var Browser = require('zombie')

var argv = require('minimist')(process.argv.slice(2))
if (argv.h || argv._.length < 2) {
  console.log('USAGE: node client.js <url_file> <output_dir>')
  console.log('-h print this help menu')
  process.exit()
}
url_file = argv._[0]
out_dir = argv._[1]

var obj = { }
var resources = { }

function writeResourcesToFiles() {
  for (var hostname in obj) {
    var directory = path.join(out_dir, hostname)
    writeDirectory(directory,obj[hostname])
  }
}

function writeDirectory(directory, obj) {
  var filename = path.join(directory, 'resources.list')
  fs.readFile(filename, 'utf8', function(err, data) {
    if (err) {
      console.log('Filename='+filename+' Error: '+err)
      writeResourcesFile(filename, obj)
      return
    } 
/*    var oobj = JSON.parse(data)
    var maximum = findMaximum(oobj)
    for (key in obj) {
      if (!oobj[key]) {
        oobj[key] = ++maximum
      }
    }
    writeResourcesFile(filename, oobj)*/
    writeResourcesFile(filename, obj)
  })
}

/*function convertForWrite(obj) {
  var nobj = { }
  for (var key in obj) {
    nobj[key] = obj[key].ref
  }
  return nobj
}*/

function writeResourcesFile(filename, obj) {
  fs.writeFile(filename, JSON.stringify(obj, null, '\t'), function (err) {
    if (err) console.log('Filename='+filename+' Error: '+err)
  })
}

function findMaximum(obj) {
  var maximum = 0  
  for (var key in obj) {
    if (obj[key].ref > maximum) {
      maximum = obj[key].ref
    }
  }
  return maximum
}

function getResource(url) {
  var hostname = urlparse(url).hostname
  var directory = path.join(out_dir, hostname)

  if (!obj[hostname]) {
    obj[hostname] = { }
    fs.mkdir(directory, function(err) {
      if (err) console.log('Directory='+directory+' Error: '+err)
    })
  }
  if (obj[hostname][url]) return obj[hostname][url]
  obj[hostname][url] = {
	ref : findMaximum(obj[hostname])+1,
	responseCode : undefined,
	headers : undefined
  }
  return obj[hostname][url]
}

function getResourceFile(url) {
  var directory = path.join(out_dir, urlparse(url).hostname)
  return path.join(directory, getResource(url).ref+'.response')
}

function fetch(url) {
  var browser = Browser.create()
  browser.visit(url, function () {
    browser.resources.forEach(function (resource) {
      if (resource) {
        var nurl = urlresolve(url, resource.request.url)
        var data = getResource(nurl)
	// Never been fetched
	if (!data.responseCode) {
	  console.log(nurl)
	  data.responseCode = 'pending'
	  try {
	    request.get({uri : nurl, followRedirect : false}).on('response', onResponse).on('error', function (err) { console.log(err) })
	  } catch (e) {
	    console.log(e)
	    data.responseCode = 'failed'
	  }
     	}
      }
    })
  })
}

function onResponse(response) {
  var filename = getResourceFile(response.request.uri.href)
  response.pipe(fs.createWriteStream(filename))
  var resource = getResource(response.request.uri.href)
  resource.responseCode = response.statusCode
  resource.headers = response.headers

  // Redirect
  if (response.headers['location']) {
    var nurl = urlresolve(response.request.uri.href, response.headers['location'])
    var data = getResource(nurl)
    if (!data.responseCode) {
      console.log('REDIRECT '+nurl)
      data.responseCode = 'pending'
      try {
        request.get({ uri : nurl, followRedirect : false}).on('response', onResponse).on('error', function (err) { console.log(err) })
      } catch (e) {
        console.log(e)
        data.responseCode = 'failed'
      }
    }
  }
}

var buf = fs.readFileSync(url_file)
var urls = buf.toString().split('\n')

var i = 0
function next() {
  if (i < urls.length) {
    fetch(urls[i])
    i += 1
    setTimeout(next, 1000)
  } else {
    setTimeout(writeResourcesToFiles, 20000)
  }
}
next()

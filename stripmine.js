var fs = require('fs')
var nfs = require('node-fs')
var urlparse = require('url').parse
var urlresolve = require('url').resolve
var path = require('path')
var request = require('request')
var CS = require('coffee-script')
CS.register()
var Browser = require('zombie')

var argv = require('minimist')(process.argv.slice(2))
if (argv.h || argv._.length != 2) {
  console.log('USAGE: node client.js <url_file> <output_dir>')
  console.log('-h print this help menu')
  process.exit()
}
url_file = argv._[0]
out_dir = argv._[1]

function parse_url(url) {
  var details = urlparse(url)
  var path = details.pathname
  if (path.extname(details.pathname)) {
    details.filename = path.basename(details.pathname)
    details.directory = path.dirname(details.pathname)
  } else {
    details.filename = 'index.html'
    details.directory = details.pathname
  }
  return details
}

function get_directory(details) {
  return path.join(path.join(out_dir,details.host), details.directory))
}

function get_filename(details) {
  return path.join(get_directory(details), details.filename)
}

var pending = 0
function fetchBrowser(url) {
  pending = 0
  var browser = Browser.create()
  browser.visit(url, function () {
    browser.resources.forEach(function (resource) {
      if (resource) {
        var embed_url = urlresolve(url, resource.request.url)
	fetchObject(embed_url)
	pending += 1
      }
    })
  })
  if (pending === 0) {
    nextURL()
  }
}

function fetchObject(url) {
  var details = parse_url(url)
  // Create domain directory
  nfs.mkdir(get_directory(details), 0777, true, function () {})

  try {
    request.get({uri : url, followRedirect : true}).on('response', onResponse).on('error', function (err) { 
      console.log(err)
      done()
    })
  } catch (e) {
    console.log(e)
    done()
  }
}

function onResponse(response) {
  var details = parse_url(response.request.uri.href)

  // Write response object to file
  response.pipe(fs.createWriteStream(get_filename(details)))

  // Store the headers
  var data = {
  	responseCode = response.statusCode
  	headers = response.headers
  }
  fs.writeFile(get_filename(details)+'.headers', JSON.stringify(data, null, '\t'), function (err) {
    if (err) console.log(err)
  })
  done()
}

function done() {
  pending -= 1
  if (pending === 0)
    nextURL()
}

// Load the files
var urls = fs.readFileSync(url_file).toString().split('\n')
try {
  fs.mkdirSync(out_dir)
} catch (e) {
  console.log('Error creating output directory.')
}

var i = 0
// Fetch URLs one at a time
function nextURL() {
  if (i < urls.length) {
    fetch(urls[i])
    i += 1
  } else {
    process.exit()
  }
}

// Go
nextURL()

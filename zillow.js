'use strict;'

// CONFIG
var daysOnZillow = 1;
//only options availiable on the site are valid (1 ok, 7 ok, 2 not ok)

// Note, sometimes you will need to recopy those urls from the browser (when getting HTTP 301)
var places = [
	"http://www.zillow.com/homes/for_sale/Essex-County-NJ/list/fsba,fsbo,new_lt/house,condo,apartment_duplex,townhouse_type/504_rid/570-761_mp/"+daysOnZillow+"_days/40.895349,-73.989143,40.687407,-74.501381_rect/0_mmm/",
	"http://www.zillow.com/homes/for_sale/Union-County-NJ/list/fsba,fsbo,new_lt/house,condo,apartment_duplex,townhouse_type/771_rid/570-761_mp/"+daysOnZillow+"_days/40.739229,-74.136702,40.591903,-74.46335_rect/0_mmm/",
	"http://www.zillow.com/homes/for_sale/Bergen-County-NJ/list/fsba,fsbo,new_lt/house,condo,apartment_duplex,townhouse_type/874_rid/571-761_mp/"+daysOnZillow+"_days/41.133995,-73.893978,40.762114,-74.272483_rect/0_mmm/",
	"http://www.zillow.com/homes/for_sale/Hudson-County-NJ/list/fsba,fsbo,new_lt/house,condo,apartment_duplex,townhouse_type/1106_rid/570-761_mp/" + daysOnZillow + "_days/40.823569,-73.984882,40.642149,-74.166086_rect/0_mmm/"
];

// END CONFIG


var http = require("http"),
cheerio = require("cheerio"),
fs = require('fs'),
j = require('jquery');

var json2csv = require('json2csv');
var humanize = require('humanize');

function download(url, callback) {
	http.get(url, function (res) {
		var data = "";
		res.on('data', function (chunk) {
			data += chunk;
		});
		res.on("end", function () {
			callback(data);
		});
	}).on("error", function () {
		callback(null);
	});

}
var isFirstLine = true;

var today = new Date();
var dd = today.getDate();
var mm = today.getMonth() + 1; //January is 0!
var yyyy = today.getFullYear();

if (dd < 10) {
	dd = '0' + dd
}

if (mm < 10) {
	mm = '0' + mm
}

today = mm + '-' + dd + '-' + yyyy;
var file_name = 'zillowNJ-' + today + '.csv';

function appendHouseToCSVFile(obj) {
	//console.log(obj);
	json2csv({
		data: obj,
		fields: ['ratio', 'price', 'rent', 'tax', 'address', 'link', 'place'],
		hasCSVColumnTitle: isFirstLine
	}, function (err, csv) {
		//console.log(csv);
		if (err) console.log(err);
		fs.appendFile(file_name, csv, function (err) {
			if (err) throw err;
			console.log('Saved house in: ' + obj.place);
		});
	});

	isFirstLine = false;
}

// Empty the CSV file
fs.writeFile('file_name', '');

// For each of the places we care about
places.forEach(function processUrl(url, index) {
	// Figure out the place name from the url
	var t = url.substr(37);
	var p = t.indexOf('/');
	var placeName = t.substr(0, p);
	//    console.log("Handling place: " + placeName);

	// Download this place houses list
	download(url, function (data) {
		if (!data) {
			console.log(placeName + " is empty url:", url, " it may mean that you need to recopy the places urls from the browser (when getting HTTP 301)");
			return;
		}

		var $ = cheerio.load(data);
		var houseLinks = $('ul.photo-cards a.hdp-link');

		console.log(placeName + " has " + houseLinks.length + " houses, url: " + url);
		if (houseLinks.length > 25) {
			console.log(placeName + " has more houses...");
			var $nextLink = $('#search-pagination-wrapper li.zsg-pagination-next a');
			//console.log($nextLink.length);
			if ($nextLink.length) {
				processUrl('http://www.zillow.com' + $nextLink.attr('href'));

			}

		}

		// For each house link in the searched page
		houseLinks.each(function (index) {

			// Get the price
			var price = $(this).parent().find('span.zsg-photo-card-price').text();
			price = price.replace("$", "").replace(',', '');

			// Get the full link to house page
			var fullLink = $(this).attr('href');

			// Download the specific house page
			download('http://www.zillow.com' + fullLink, function (data) {

				var l = cheerio.load(data);

				// Get the address
				var address = l('.addr h1').text();
				var zentAstimate = null;

				// Get rent price
				if (l('.zest-value').eq(1).length > 0) {
					zentAstimate = l('.zest-value').eq(1).text();
					zentAstimate = parseInt(zentAstimate.replace("$", "").replace(',', ''));
				}

				var objHouse = {
					ratio: 'unknown',
					price: humanize.numberFormat(price) + '$',
					address: address,
					link: 'http://www.zillow.com' + fullLink,
					place: placeName,
					rent: zentAstimate,
					tax: 'unknown',
					taxDiff: 'unknown'
				};

				// Make the crawled HTML a single line (helps RegExp to be more bullet proof)
				data = data.replace(/\r?\n|\r/g, '');
				// Get the link to tax table
				var linkToTax = data.match('ajaxURL:"([^"]+?)",jsModule:"z-complaints-table"');

				//                  console.log("##############  linkToTax:" + linkToTax);

				if (linkToTax && linkToTax.length > 1) linkToTax = linkToTax[1];
				if (linkToTax) {
					// Download the Tax info
					download('http://www.zillow.com' + linkToTax, function (data) {

						var d = JSON.parse(data);
						//console.log('data length ',data.length);
						var c = cheerio.load(d.html);

						var strWithTax = c('table tr:first-child > td:nth-child(2)').text();
						strWithTax = strWithTax.replace("$", "").replace(',', '').replace('%', '');
						//console.log("strWithTax:", strWithTax);

						var parts;
						if (strWithTax) {
							var plusOrMinus = strWithTax.indexOf("+");
							//console.log("plusOrMinus:", plusOrMinus);
							if (plusOrMinus > -1) {
								parts = strWithTax.split("+");
							} else {
								parts = strWithTax.split("-");
							}

							var tax = parts[0];
							//var taxDiff     = parts[1];
							tax = parseInt(tax);

							//console.log("Property Page: ", 'http://www.zillow.com' + fullLink);
							//console.log("parts:", parts);
							//console.log("tax:", tax);

							objHouse.tax = tax;
							//objHouse.taxDiff = taxDiff;
							var ratio = ((zentAstimate * 12) - tax) / (price);
							//console.log("ratio: ", ratio);
							//objToPush.ratio = ratio.toFixed(2) + '%';
							objHouse.ratio = ratio + '%';

							appendHouseToCSVFile(objHouse);
						} else {
							// No Tax Info, still add to CSV
							appendHouseToCSVFile(objHouse);
						}

					}) // Download the Tax info
				} else {
					// No Tax Info, still add to CSV
					appendHouseToCSVFile(objHouse);
				}
			}) // Done handling the specific house page

		}) // For each house link in the searched page

	}); // Download this place houses list
}) // For each of the places we care about

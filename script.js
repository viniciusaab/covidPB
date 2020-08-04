var numberOfCities = 10;
var latestRecords;
var mostInfectedCities;
var lastWeekRecords;
var epidemiologicalWeeks;
var infectionTrajectoryChart;
var cities = [];

// Heatmap variables
var heatmapData = {};
var heatmapSvg;
var maxCases = 0;
var colorScaleFilled;
var projection;
var path;
var rangeTimer;

$(document).ready(function() {
	// Removes the state records and undefined
	data = data.filter(d => d.place_type === 'city');
	data = data.filter(d => d.city !== 'Importados/Indefinidos')

	// Fetchs only the last records available
	latestRecords = data.filter(d => d.is_last);

	// Sorts the cities with the most confirmed cases, getting the quantity defined in the numberOfCities variable and fetchs de City name
	mostInfectedCities = latestRecords.sort((a, b) => b.last_available_confirmed - a.last_available_confirmed)
							 		  .slice(0, numberOfCities)
							 		  .map(a => a.city);

	// Order the records from last to new and by City name
	data.reverse()
		.sort(compare);

	// Fetchs the number of epidemiological weeks, removes duplicates and sort by number
	epidemiologicalWeeks = data.map(d => d.epidemiological_week)
							   .filter(filterUnique)
							   .sort();

	// Creates the visualizations
	createStateHeatmap();
	createInfectionAndDeathRateTable();
	createCasesPer100kTable();
	createDeathsPer100kTable();
	createInfectionTrajectoryChart();
});

function createStateHeatmap() {
	confirmed_or_deaths = $('[name="casesOrDeathsCheckbox"]:radio:checked').val();
	estado = topojson.feature(brasil, brasil.objects["25"]);
	statesOuter = topojson.mesh(brasil, brasil.objects["25"], (a, b) => a === b);
	statesInner = topojson.mesh(brasil, brasil.objects["25"], (a, b) => a !== b);

	dates = data.map(d => d.date).filter(filterUnique).sort();
	$('#dateRange').attr('max',dates.length -1);

	breakpoint = 500;
	maxRadius = 30;

	$.each(data, function(index, registro) {
		if (registro['city'] != null) {
			var date = registro.date;

			if (heatmapData[date] == undefined) {
				heatmapData[date] = [];
			}

			heatmapData[date].push({
				city: registro.city,
				confirmed: registro.last_available_confirmed,
				deaths: registro.last_available_deaths,
				city_ibge_code: registro.city_ibge_code
			});
		}
	});

	d3.csv("https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/master/csv/municipios.csv").then(function(municipios) {
		data_city = municipios.filter(d => d.codigo_uf === "25").map(d => {
			return {
				latitude: +d.latitude,
				longitude: +d.longitude,
				city_ibge_code: +d.codigo_ibge,
				city: d.nome,
			};
		});

		for (let key in heatmapData) {
			let value = d3.max(heatmapData[key], d => d[confirmed_or_deaths]);

			if (value > maxCases) {
				maxCases = value;
			}
		}

		currentData = heatmapData[dates[0]];

		$('#currentDate').text(
			moment(dates[0]).format('D MMMM YYYY').replace(/ /g,' de ')
		);

		colorScaleFilled = d3.scaleSequentialSqrt(d3.interpolateYlOrRd).domain([0, maxCases]);

		const magnitude = toMagnitude(maxCases);
		const maxLegend = Math.round(maxCases / magnitude) * magnitude;

		const h = 400;
		const w = 700;
		const index = Object.keys(heatmapData).length;

		projection = d3
		.geoMercator()
		.fitExtent([[20, 0], [w-20, h]], estado);

		path = d3
		.geoPath()
		.projection(projection);

		const colorScale = d3
		.scaleSqrt()
		.domain([0, maxCases])
		.range(['hsla(57, 100%, 50%, 0.36)', 'hsla(7, 100%, 50%, 0.57)']);

		const radius = d3
		.scaleSqrt()
		.domain([0, maxCases])
		.range([0, maxRadius]);

		heatmapSvg = d3
		.select("#heatmap")
		.append("svg")
		.attr("viewBox", [0, 0, w, h])
		.attr("width", "100%")
		.attr("class", "paraiba");

		heatmapSvg.append("path")
		.datum(statesOuter)
		.attr("class", "outer")
		.attr("d", path)
		.attr("id", "usPath")
		.attr("stroke", "grey")
		.attr('stroke-width', '1px')

		heatmapSvg
		.selectAll(".subunit")
		.data(estado.features)
		.enter()
		.append("path")
		.attr("stroke", "#BBB")
		.attr("class", "county")
		.attr("onmouseover","showDetails($(this))")
		.attr("data-html", "true")
		.style('stroke-width', d => {
			let index = currentData.findIndex(dd => dd.city_ibge_code === d.properties.cod);
			let value = currentData[index] ? currentData[index][confirmed_or_deaths] : 0;

			return value > 0 ? "0px" : "0.25px";
		}).attr("fill", d => {
			let index = currentData.findIndex(dd => dd.city_ibge_code === d.properties.cod);
			let value = currentData[index] ? currentData[index][confirmed_or_deaths] : 0;

			return value > 0 ? colorScaleFilled(value) : "#fff";
		})
		.attr("d", path)
		.append("text")
		.text(d => {
			let index = currentData.findIndex(dd => dd.city_ibge_code === d.properties.cod);
			let value = currentData[index] ? currentData[index]['city'] : '';
			return value;
		});
	});

	//controlRange();
}

function updateHeatmapData() {
	index = $('#dateRange').val();
	confirmed_or_deaths = $('[name="casesOrDeathsCheckbox"]:radio:checked').val();
	currentData = heatmapData[dates[index]];

	$('#currentDate').text(
		moment(dates[index]).format('D MMMM YYYY').replace(/ /g,' de ')
	);
	
	heatmapSvg
	.selectAll(".county")
	.style('stroke-width', d => {
	    let index = currentData.findIndex(dd => dd.city_ibge_code === d.properties.cod);
	    let value = currentData[index] ? currentData[index][confirmed_or_deaths] : 0;

	    return value > 0 ? "0px" : "0.25px";
	}).attr("fill", d => {
	    let index = currentData.findIndex(dd => dd.city_ibge_code === d.properties.cod);
	    let value = currentData[index] ? currentData[index][confirmed_or_deaths] : 0;

	    return value > 0 ? colorScaleFilled(value) : "#fff";
	}).select("text").text(d => {
		let index = currentData.findIndex(dd => dd.city_ibge_code === d.properties.cod);
		let value = currentData[index] ? currentData[index]['city'] : 0;
		return value;
	});
}

function showDetails(e) {
	if (e[0].textContent) {
		var record = latestRecords.find(d => d.city === e[0].textContent);
		var content = 
		'<div>' +
			'<p>' + record.city + '</p>' +
			'<table>' +
				'<tbody>' +
					'<tr>' +
						'<td>População estimada (2019)</td>' +
						'<td>' + addSeparator(record.estimated_population_2019) + '</td>' +
					'</tr>' +
					'<tr>' +
						'<td>Casos confirmados</td>' +
						'<td>' + addSeparator(record.last_available_confirmed) + '</td>' +
					'</tr>' +
					'<tr>' +
						'<td>Mortes confirmadas</td>' +
						'<td>' + addSeparator(record.last_available_deaths) + '</td>' +
					'</tr>' +
					'<tr>' +
						'<td>% de mortalidade</td>' +
						'<td>' + (record.last_available_death_rate * 100).toFixed(1) + '%</td>' +
					'</tr>' +
				'</tbody>' +
			'</table>' +
			//'<p>População estimada (2019)<br/><b>' + addSeparator(record.estimated_population_2019) + '</b><p/>' +
			//'<p>Casos confirmados<br/><b>' + addSeparator(record.last_available_confirmed) + '</b><p/>' +
			//'<p>Mortes confirmadas<br/><b>' + addSeparator(record.last_available_deaths) + '</b><p/>' +
			//'<p>% de mortalidade<br/><b>' + (record.last_available_death_rate * 100).toFixed(1) + '%</b></p>' +
		'</div>';
		
		e.attr('title', content).tooltip({
			sanitize: false
		}).tooltip('show');
	}
}

function controlRange() {
	var dateRange = $('#dateRange');

	rangeTimer = setInterval(function() {
		if (dateRange.val() == dateRange.attr('max')) {
			clearInterval(rangeTimer);
			return false;
		}

		dateRange.val(parseInt(dateRange.val()) +1);
		updateHeatmapData();
	},250);
}

function createInfectionAndDeathRateTable() {
	var casesAndDeaths = '';
	var maxValueCases = 0;
	var maxValueDeaths = 0;
	var maxDeathRate = latestRecords.slice(0, numberOfCities)
									.sort((a, b) => b.last_available_death_rate - a.last_available_death_rate)
									.map(d => d.last_available_death_rate)[0];

	$.each(latestRecords.slice(0, numberOfCities), function(index, latestRecord) {
		if (index === 0) {
			maxValueCases = latestRecord.last_available_confirmed;
			maxValueDeaths = latestRecord.last_available_deaths;
		}

		var lastWeekRecords = data.filter(d => d.city === latestRecord.city && !d.is_last)
						   		  .reverse()
						   		  .slice(0, 7);

		var lastWeekAverage = lastWeekRecords.map(r => r.new_confirmed)
									  		 .reduce((total, currentValue) => total + currentValue) / 7;

		var lastDayFluctuation = calcDifference(latestRecord.new_confirmed, lastWeekRecords[0].new_confirmed);
		var lastDayFluctuationColor = (lastDayFluctuation > 0 ? 'orange' : 'blue');

		var lastWeekFluctuation = calcDifference(latestRecord.new_confirmed, lastWeekAverage);
		var lastWeekFluctuationColor = (lastWeekFluctuation > 0 ? 'orange' : 'blue');

		var fillWidthCases = calcPercentage(latestRecord.last_available_confirmed, maxValueCases);
		var fillWidthDeaths = calcPercentage(latestRecord.last_available_deaths, maxValueDeaths);
		var fillWidthDeathRate = calcPercentage(latestRecord.last_available_death_rate, maxDeathRate);


		casesAndDeaths +=
		'<tr class="font-mini">' +
			'<td class="cities">'+ latestRecord.city +'</td>' +
			'<td class="hollow-width">' +
				'<div class="fill" style="width: '+ fillWidthCases +'%;">' +
					'<span>'+ addSeparator(latestRecord.last_available_confirmed) +'</span>' +
				'</div>' +
			'</td>' +
			'<td class="'+ lastDayFluctuationColor +'">'+ (lastDayFluctuation > 0 ? '+' : '') + lastDayFluctuation.toFixed(1) +'%</td>' +
			'<td class="'+ lastWeekFluctuationColor +'">'+ (lastWeekFluctuation > 0 ? '+' : '') + lastWeekFluctuation.toFixed(1) +'%</td>' +
			'<td class="hollow-width">' +
				'<div class="fill" style="width: '+ fillWidthDeaths +'%;">' +
					'<span>'+ addSeparator(latestRecord.last_available_deaths) +'</span>' +
				'</div>' +
			'</td>' +
			'<td class="progress-lines">' +
				'<div style="width: '+ fillWidthDeathRate +'%;">' +
					'<span class="line"></span>' +
					'<span class="bullet-point">•</span>' +
				'</div>' +
			'</td>' +
			'<td class="orange">'+ (latestRecord.last_available_death_rate * 100).toFixed(1) +'%</td>' +
		'</tr>';
	});

	$('#tblInfectionFatalityRates tbody').append(casesAndDeaths);
}

function createCasesPer100kTable() {
	var casesPer100k = '';
	var maxValueCases100k = 0;

	$.each(latestRecords.slice(0,numberOfCities).sort((a, b) => b.last_available_confirmed_per_100k_inhabitants - a.last_available_confirmed_per_100k_inhabitants), function(index, latestRecord) {
		if (index == 0) {
			maxValueCases100k = latestRecord['last_available_confirmed_per_100k_inhabitants'];
		}

		var fillWidthCases100k = (latestRecord['last_available_confirmed_per_100k_inhabitants'] / maxValueCases100k) * 100;

		casesPer100k +=
		'<tr class="font-mini">' +
		'<td class="cities">'+ latestRecord['city'] +'</td>' +
		'<td class="hollow-width"><div class="fill-blue" style="width: '+ fillWidthCases100k +'%;"><span>'+ addSeparator(latestRecord['last_available_confirmed_per_100k_inhabitants'].toFixed(0)) +'</span></div></td>' +
		'</tr>';
	});

	$('#tblCasesPer100k tbody').append(casesPer100k);
}

function createDeathsPer100kTable() {
	var deathsPer100k = '';

	$.each(latestRecords.slice(0,numberOfCities).sort((a, b) => ((b.last_available_deaths / b.estimated_population_2019) * 100000) - ((a.last_available_deaths / a.estimated_population_2019) * 100000)), function(index, latestRecord) {
		var deaths = ((latestRecord['last_available_deaths'] / latestRecord['estimated_population_2019']) * 100000)

		deathsPer100k +=
		'<tr class="font-mini">' +
		'<td class="cities" style="white-space: nowrap;">'+ latestRecord['city'] +'</td>' +
		'<td class="orange" style="line-height: 0.5;">'+ Array.apply(null, Array(parseInt(deaths))).map(function () { return '•'}).join(' ') + '</td>' +
		'<td style="color: #fff;">' + deaths.toFixed(0) +'</td>' +
		'</tr>';
	});

	$('#tblDeathsPer100k tbody').append(deathsPer100k);
}

function createInfectionTrajectoryChart() {
	const citiesCombobox = $('#slcCities');
	let casesPerDay = [];
	let casesPerWeek = [];

	// Populates the combobox with all the Cities
	if (citiesCombobox.find('option').length === 0) {
		$.each(latestRecords.map(r => r.city).sort(), function(index, city) {
			citiesCombobox.append('<option value="'+ city +'">'+ city +'</option>');
		});

		// Sets the City with the most cases as default
		citiesCombobox.val(latestRecords.sort((a, b) => b.last_available_confirmed - a.last_available_confirmed)[0].city);
	}

	const labels = data.filter(d => d.city === citiesCombobox.val()).map(d => d.date);
	const cityData = data.filter(d => d.city === citiesCombobox.val());

	// Loops through the city records and mounts the data arrays for the chart
	$.each(cityData, function(index, reg) {
		casesPerDay.push((reg.new_confirmed < 0 ? 0 : reg.new_confirmed));
		const weekAverage = Math.round(cityData.filter(d => new Date(d.date) <= new Date(reg.date) )
										 	   .slice(-7)
										 	   .map(r => r.new_confirmed)
										 	   .reduce((total, currentValue) => total + currentValue) / 7);
		casesPerWeek.push((weekAverage < 0 ? 0 : weekAverage));
	});

	// Destroys the chart if it already exists
	if (infectionTrajectoryChart) {
		infectionTrajectoryChart.destroy();
	}

	infectionTrajectoryChart = new Chart($('#infectionTrajectoryChart')[0], {
		type: 'bar',
		data: {
			labels: labels,
			datasets: [{
				type: 'line',
				label: 'Média semanal',
				data: casesPerWeek,
				backgroundColor: '#f18330',
				borderColor: '#f18330',
				borderWidth: 3,
				fill: false
			},
			{
				type: 'bar',
				label: 'Casos confirmados',
				data: casesPerDay,
				backgroundColor: '#26b1fe',
				borderColor: '#26b1fe',
				borderWidth: 1,
				fill: false
			}]
		},
		options: {
			responsive: true,
			legend: {
				display: false
			},
			scales: {
				xAxes: [{
					type: 'time',
					display: true,
					gridLines: {
						display: false
					},
					time: {
						unit: 'month',
					}
				}],
				yAxes: [{
					display: true,
					gridLines: {
						display: false
					}
				}]
			},
			elements: {
				point:{
					radius: 0
				}
			},
			tooltips: {
				mode: 'index',
				intersect: false,
				yAlign: 'bottom',
				callbacks: {
					title: function(tooltipItems, data) {
						return moment(tooltipItems[0].xLabel).format('D MMMM YYYY').replace(/ /g,' de ')
					}
				}
			},
			hover: {
				mode: 'index',
				intersect: false
			}
		}
	});
}

function calcDifference(newValue, oldValue) {
	return (newValue - oldValue) / oldValue * 100;
}

function calcPercentage(newValue, total) {
	return (newValue / total) * 100;
}

function filterUnique(value, index, self) { 
	return self.indexOf(value) === index;
}

function compare(a, b) {
	if (a.city < b.city) {
		return -1;
	} else if (a.city > b.city){
		return 1;
	}

	return 0;
}

function addSeparator(nStr) {
	nStr += '';
	var x = nStr.split('.');
	var x1 = x[0];
	var x2 = x.length > 1 ? '.' + x[1] : '';
	var rgx = /(\d+)(\d{3})/;
	while (rgx.test(x1)) {
		x1 = x1.replace(rgx, '$1' + ',' + '$2');
	}
	return x1 + x2;
}

function toMagnitude(n) {
	var order = Math.floor(Math.log(n) / Math.LN10 + 0.000000001);
	return Math.pow(10, order);
}
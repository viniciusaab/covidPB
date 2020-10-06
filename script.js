var numberOfCities = 10;
var latestRecords;
var mostInfectedCities;
var lastWeekRecords;
var epidemiologicalWeeks;
var infectionTrajectoryChart;
var symptomsToDeathPeriodChart;
var mostCommonComorbitiesChart;
var deathsByAgeAndGenderChart;
var cities = [];

// Heatmap variables
var heatmapData = {};
var heatmapSvg;
var maxCases = 0;
var maxDeaths = 0;
var colorScale;
var colorScaleFilled;
var projection;
var path;
var rangeTimer;
var radius;

// Loading screen variables
var support = { animations : Modernizr.cssanimations },
	container = document.getElementById( 'ip-container' ),
	header = container.querySelector( 'header.ip-header' ),
	loader = new PathLoader( document.getElementById( 'ip-loader-circle' ) ),
	animEndEventNames = { 'WebkitAnimation' : 'webkitAnimationEnd', 'OAnimation' : 'oAnimationEnd', 'msAnimation' : 'MSAnimationEnd', 'animation' : 'animationend' },
	// animation end event name
	animEndEventName = animEndEventNames[ Modernizr.prefixed( 'animation' ) ];

$(document).ready(function() {
	initLoadingScreen();
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
	createSymptomsToDeathPeriodChart();
	createMostCommonComorbiditiesChart();
	createDeathsByAgeAndGenderChart();
});

function createStateHeatmap() {
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

	d3.csv("https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/csv/municipios.csv").then(function(municipios) {
		data_city = municipios.filter(d => d.codigo_uf === "25").map(d => {
			return {
				latitude: +d.latitude,
				longitude: +d.longitude,
				city_ibge_code: +d.codigo_ibge,
				city: d.nome,
			};
		});

		for (let key in heatmapData) {
			let valueCases = d3.max(heatmapData[key], d => d["confirmed"]);
			let valueDeaths = d3.max(heatmapData[key], d => d["deaths"]);

			if (valueCases > maxCases) {
				maxCases = valueCases;
			}

			if (valueDeaths > maxDeaths) {
				maxDeaths = valueDeaths;
			}
		}

		currentData = heatmapData[dates[0]];

		$('#currentDate').text(
			moment(dates[0]).format('D MMMM YYYY').replace(/ /g,' de ')
		);

		colorScaleFilled = d3.scaleSequentialSqrt(d3.interpolateYlOrRd).domain([0, maxCases]);

		const magnitude = toMagnitude(maxCases);
		const maxLegend = Math.round(maxCases / magnitude) * magnitude;
		const legendRadii = [10, 500, 2000, 10000];

		const h = 400;
		const w = 700;
		const index = Object.keys(heatmapData).length;

		projection = d3
		.geoMercator()
		.fitExtent([[20, 0], [w-20, h]], estado);

		path = d3
		.geoPath()
		.projection(projection);

		colorScale = d3
		.scaleSqrt()
		.domain([0, maxDeaths])
		.range(['hsla(57, 100%, 50%, 0.36)', 'hsla(7, 100%, 50%, 0.57)']);

		radius = d3
		.scaleSqrt()
		.domain([0, maxDeaths])
		.range([0, maxRadius]);

		heatmapSvg = d3
		.select("#heatmap")
		.append("svg")
		.attr("viewBox", [0, 0, w, h])
		.attr("width", "60vw")
		.attr("class", "paraiba");

		const legend = heatmapSvg
		.append("g")
		.attr("class", "legend")
		.attr("fill", "#777")
		.attr(
			"transform",
			`translate(${w > breakpoint ? [w - w / 3.5, h / 3.5] : [10, h - 15]})`
		);

		const legendBubbles = legend
		.selectAll("g")
		.data(legendRadii)
		.join("g");

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
			let value = currentData[index] ? currentData[index]["confirmed"] : 0;

			return value > 0 ? "0px" : "0.25px";
		}).attr("fill", d => {
			let index = currentData.findIndex(dd => dd.city_ibge_code === d.properties.cod);
			let value = currentData[index] ? currentData[index]["confirmed"] : 0;

			return value > 0 ? colorScaleFilled(value) : "#fff";
		})
		.attr("d", path)
		.append("text")
		.text(d => {
			let index = currentData.findIndex(dd => dd.city_ibge_code === d.properties.cod);
			let value = currentData[index] ? currentData[index]['city'] : '';
			return value;
		});

		heatmapSvg
	    .selectAll(".bubble")
	    .data(estado.features)
	    .enter()
	    .append("circle")
	    .attr("onmouseover","showDetails($(this))")
	    .attr("data-html", "true")
		.attr("transform", d => {
			let index = data_city.findIndex(dd => dd.city_ibge_code === d.properties.cod);

			return "translate(" + projection([data_city[index].longitude, data_city[index].latitude]) + ")";
		})
		.attr("class", "bubble")
		.attr("fill-opacity", 0.5)
		.attr("r", d => {
			let index = currentData.findIndex(dd => dd.city_ibge_code === d.properties.cod);
			let value = currentData[index] ? currentData[index]["deaths"] : 0;

			return radius(+value)
		})
		.append("text")
		.text(d => {
			let index = currentData.findIndex(dd => dd.city_ibge_code === d.properties.cod);
			let value = currentData[index] ? currentData[index]['city'] : '';
			return value;
		});

		window.addEventListener('wheel', e => controlRange(e), {passive: false});
		window.addEventListener('keydown', e => controlRange(e), {passive: false});
	});
}

function updateHeatmapData() {
	index = $('#dateRange').val();
	currentData = heatmapData[dates[index]];

	$('#currentDate').text(
		moment(dates[index]).format('D MMMM YYYY').replace(/ /g,' de ')
	);

	const t = heatmapSvg
	.transition()
	.duration(index === 0 ? 0 : 250)
	.ease(d3.easeLinear);
	
	heatmapSvg
	.selectAll(".county")
	.style('stroke-width', d => {
	    let index = currentData.findIndex(dd => dd.city_ibge_code === d.properties.cod);
	    let value = currentData[index] ? currentData[index]["confirmed"] : 0;

	    return value > 0 ? "0px" : "0.25px";
	}).attr("fill", d => {
	    let index = currentData.findIndex(dd => dd.city_ibge_code === d.properties.cod);
	    let value = currentData[index] ? currentData[index]["confirmed"] : 0;

	    return value > 0 ? colorScaleFilled(value) : "#fff";
	})
	.select("text").text(d => {
		let index = currentData.findIndex(dd => dd.city_ibge_code === d.properties.cod);
		let value = currentData[index] ? currentData[index]['city'] : '';
		return value;
	});

	heatmapSvg.selectAll(".bubble").attr("r", d => {
	    let index = currentData.findIndex(dd => dd.city_ibge_code === d.properties.cod);
	    let value = currentData[index] ? currentData[index]["deaths"] : 0;

	    return radius(+value);
    })
	.select("text").text(d => {
		let index = currentData.findIndex(dd => dd.city_ibge_code === d.properties.cod);
		let value = currentData[index] ? currentData[index]['city'] : '';
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

function controlRange(e) {
	if (e.type == 'wheel' || (e.type == 'keydown' && e.key === 'ArrowDown')) {
		const dateRange = $('#dateRange')

		dateRange.val(parseInt(dateRange.val()) + 1);

		updateHeatmapData();

		if (dateRange.val() != dateRange.attr('max')) {
			e.preventDefault();
			return false;
		} else {
			$('.middle').hide();
		}
	}
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
	let deathsPerDay = [];
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
		const casesWeekAverage = Math.round(cityData.filter(d => new Date(d.date) <= new Date(reg.date) )
										 	   .slice(-7)
										 	   .map(r => r.new_confirmed)
										 	   .reduce((total, currentValue) => total + currentValue) / 7);

		casesPerWeek.push((casesWeekAverage < 0 ? 0 : casesWeekAverage));
		deathsPerDay.push((reg.new_deaths < 0 ? 0 : reg.new_deaths));
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
				label: 'Casos (média semanal)',
				data: casesPerWeek,
				backgroundColor: '#26b1fe',
				borderColor: '#26b1fe',
				borderWidth: 3,
				fill: false
			},
			{
				type: 'bar',
				label: 'Mortes (por dia)',
				data: deathsPerDay,
				backgroundColor: '#f18330',
				borderColor: '#f18330',
				borderWidth: 3,
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

function createSymptomsToDeathPeriodChart() {
	symptomsToDeathPeriodChart = new Chart($('#symptomsToDeathPeriodChart')[0], {
		type: 'horizontalBar',
		data: {
			datasets: [{
				label: 'até 7 dias',
				data: [
					(detailedDeathsData.filter(d => dateDifference(d['Data do Óbito'],d['Inicio Sintomas']) < 7).length / detailedDeathsData.length) * 100
				],
				backgroundColor: '#f0a66e',
				borderColor: '#242731'
			},
			{
				label: 'entre 7 e 14 dias',
				data: [
					(detailedDeathsData.filter(d => dateDifference(d['Data do Óbito'],d['Inicio Sintomas']) >= 7 && dateDifference(d['Data do Óbito'],d['Inicio Sintomas']) < 14).length / detailedDeathsData.length) * 100
				],
				backgroundColor: '#f2944e',
				borderColor: '#242731'
			},
			{
				label: 'entre 14 e 21 dias',
				data: [
					(detailedDeathsData.filter(d => dateDifference(d['Data do Óbito'],d['Inicio Sintomas']) >= 14 && dateDifference(d['Data do Óbito'],d['Inicio Sintomas']) < 21).length / detailedDeathsData.length) * 100
				],
				backgroundColor: '#f18330',
				borderColor: '#242731'
			},
			{
				label: 'mais que 21 dias',
				data: [
					(detailedDeathsData.filter(d => dateDifference(d['Data do Óbito'],d['Inicio Sintomas']) > 21).length / detailedDeathsData.length) * 100
				],
				backgroundColor: '#f07113',
				borderColor: '#242731'
			}]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			legend: {
				position: 'bottom',
	            labels: {
	                fontColor: '#999'
	            }
			},
			title: {
				display: false
			},
			tooltips: {
				enabled: false
			},
			events: [],
			animation: {
				onComplete: function() {
				      var chartInstance = this.chart;
				      var ctx = chartInstance.ctx;
				      ctx.font = Chart.helpers.fontString(Chart.defaults.global.defaultFontFamily, 'normal', Chart.defaults.global.defaultFontFamily);
				      ctx.textAlign = "left";
				      ctx.fillStyle = "#fff";

				      Chart.helpers.each(
				        this.data.datasets.forEach(function(dataset, i) {
				          var meta = chartInstance.controller.getDatasetMeta(i);
				          Chart.helpers.each(
				            meta.data.forEach(function(bar, index) {
				              let percentage = dataset.data[index].toFixed(2) + '%';
				              ctx.fillText(percentage, bar._model.x - 50, bar._model.y);
				            }),
				            this
				          );
				        }),
				        this
				      );
				}
			},
			scales: {
				xAxes: [{
					stacked: true,
					gridLines: {
						display: true,
					},
					ticks: {
						fontColor: "#999",
					},
				}],
				yAxes: [{
					stacked: true,
					display: true,
					gridLines: {
						display: true,
					},
					ticks: {
						fontColor: "#999",
					},
				}],
			}
		}
	});

	//symptomsToDeathPeriodChart.canvas.parentNode.style.height = '100px';
}

function createMostCommonComorbiditiesChart() {
	let mostCommonComorbities = {};
	let mostCommonComorbitiesArray = [];

	$.each(detailedDeathsData.map(d => d['Doenças preexistentes']), function(index, data) {
		const comorbities = data.split(',');

		$.each(comorbities, function(index, comorbidity) {
			comorbidity = comorbidity.trim();
			if (!mostCommonComorbities[comorbidity]) {
				mostCommonComorbities[comorbidity] = 0;
			}

			mostCommonComorbities[comorbidity]++;
		});
	});

	mostCommonComorbitiesArray = Object.keys(mostCommonComorbities).map(function(d, i) {
		return {
			label: d,
			data: Object.values(mostCommonComorbities)[i]
		};
	}).sort(function(a, b) {
		return b.data - a.data;
	});

	mostCommonComorbitiesChart = new Chart($('#mostCommonComorbitiesChart')[0], {
		type: 'horizontalBar',
		data: {
			labels: mostCommonComorbitiesArray.map(c => c.label),
			datasets: [{
				data: mostCommonComorbitiesArray.map(c => c.data),
				backgroundColor: '#f18330',
				borderColor: '#242731'
			}]
		},
		options: {
			responsive: true,
			legend: {
				display: false
			},
			title: {
				display: false
			},
			animation: {
				onComplete: function() {
					const ctx = this.chart.ctx;
					ctx.font = Chart.helpers.fontString(Chart.defaults.global.defaultFontFamily, 'normal', Chart.defaults.global.defaultFontFamily);
					ctx.textAlign = 'left';
					ctx.textBaseline = 'bottom';

					this.data.datasets.forEach(function (dataset) {
						for (let i = 0; i < dataset.data.length; i++) {
							const model = dataset._meta[Object.keys(dataset._meta)[0]].data[i]._model,
							scale_max = dataset._meta[Object.keys(dataset._meta)[0]].data[i]._yScale.maxHeight;
							left = dataset._meta[Object.keys(dataset._meta)[0]].data[i]._xScale.left;
							offset = dataset._meta[Object.keys(dataset._meta)[0]].data[i]._xScale.longestLabelWidth;
							ctx.fillStyle = '#fff';
							let y_pos = model.y - 5;
							const label = dataset.data[i] + ' (' + ((dataset.data[i] / detailedDeathsData.length) * 100).toFixed(2) + '%)';

							if ((scale_max - model.y) / scale_max >= 0.93)
								y_pos = model.y + 20; 

							ctx.fillText(label, left + 10, model.y + 8);
						}
					});   
				}
			},
			tooltips: {
				enabled: false
			},
			events: [],
			scales: {
				xAxes: [{
					gridLines: {
						display: true,
					},
					ticks: {
						fontColor: "#999",
					},
				}],
				yAxes: [{
					display: true,
					gridLines: {
						display: true,
					},
					ticks: {
						fontColor: "#999",
					},
				}],
			}
		}
	});
}

function createDeathsByAgeAndGenderChart() {
	const pyramidData = [	
	{age: "≥85", sex: "M", value: detailedDeathsData.filter(d => d.Idade >= 85 && d.Sexo == 'Masculino').length},
	{age: "≥85", sex: "F", value: detailedDeathsData.filter(d => d.Idade >= 85 && d.Sexo == 'Feminino').length},
	{age: "80-84", sex: "M", value: detailedDeathsData.filter(d => d.Idade >= 80 && d.Idade <= 84 && d.Sexo == 'Masculino').length},
	{age: "80-84", sex: "F", value: detailedDeathsData.filter(d => d.Idade >= 80 && d.Idade <= 84 && d.Sexo == 'Feminino').length},
	{age: "75-79", sex: "M", value: detailedDeathsData.filter(d => d.Idade >= 75 && d.Idade <= 79 && d.Sexo == 'Masculino').length},
	{age: "75-79", sex: "F", value: detailedDeathsData.filter(d => d.Idade >= 75 && d.Idade <= 79 && d.Sexo == 'Feminino').length},
	{age: "70-74", sex: "M", value: detailedDeathsData.filter(d => d.Idade >= 70 && d.Idade <= 74 && d.Sexo == 'Masculino').length},
	{age: "70-74", sex: "F", value: detailedDeathsData.filter(d => d.Idade >= 70 && d.Idade <= 74 && d.Sexo == 'Feminino').length},
	{age: "65-69", sex: "M", value: detailedDeathsData.filter(d => d.Idade >= 65 && d.Idade <= 69 && d.Sexo == 'Masculino').length},
	{age: "65-69", sex: "F", value: detailedDeathsData.filter(d => d.Idade >= 65 && d.Idade <= 69 && d.Sexo == 'Feminino').length},
	{age: "60-64", sex: "M", value: detailedDeathsData.filter(d => d.Idade >= 60 && d.Idade <= 64 && d.Sexo == 'Masculino').length},
	{age: "60-64", sex: "F", value: detailedDeathsData.filter(d => d.Idade >= 60 && d.Idade <= 64 && d.Sexo == 'Feminino').length},
	{age: "55-59", sex: "M", value: detailedDeathsData.filter(d => d.Idade >= 55 && d.Idade <= 59 && d.Sexo == 'Masculino').length},
	{age: "55-59", sex: "F", value: detailedDeathsData.filter(d => d.Idade >= 55 && d.Idade <= 59 && d.Sexo == 'Feminino').length},
	{age: "50-54", sex: "M", value: detailedDeathsData.filter(d => d.Idade >= 50 && d.Idade <= 54 && d.Sexo == 'Masculino').length},
	{age: "50-54", sex: "F", value: detailedDeathsData.filter(d => d.Idade >= 50 && d.Idade <= 54 && d.Sexo == 'Feminino').length},
	{age: "45-49", sex: "M", value: detailedDeathsData.filter(d => d.Idade >= 45 && d.Idade <= 49 && d.Sexo == 'Masculino').length},
	{age: "45-49", sex: "F", value: detailedDeathsData.filter(d => d.Idade >= 45 && d.Idade <= 49 && d.Sexo == 'Feminino').length},
	{age: "40-44", sex: "M", value: detailedDeathsData.filter(d => d.Idade >= 40 && d.Idade <= 44 && d.Sexo == 'Masculino').length},
	{age: "40-44", sex: "F", value: detailedDeathsData.filter(d => d.Idade >= 40 && d.Idade <= 44 && d.Sexo == 'Feminino').length},
	{age: "35-39", sex: "M", value: detailedDeathsData.filter(d => d.Idade >= 35 && d.Idade <= 39 && d.Sexo == 'Masculino').length},
	{age: "35-39", sex: "F", value: detailedDeathsData.filter(d => d.Idade >= 35 && d.Idade <= 39 && d.Sexo == 'Feminino').length},
	{age: "30-34", sex: "M", value: detailedDeathsData.filter(d => d.Idade >= 30 && d.Idade <= 34 && d.Sexo == 'Masculino').length},
	{age: "30-34", sex: "F", value: detailedDeathsData.filter(d => d.Idade >= 30 && d.Idade <= 34 && d.Sexo == 'Feminino').length},
	{age: "25-29", sex: "M", value: detailedDeathsData.filter(d => d.Idade >= 25 && d.Idade <= 29 && d.Sexo == 'Masculino').length},
	{age: "25-29", sex: "F", value: detailedDeathsData.filter(d => d.Idade >= 25 && d.Idade <= 29 && d.Sexo == 'Feminino').length},
	{age: "20-24", sex: "M", value: detailedDeathsData.filter(d => d.Idade >= 20 && d.Idade <= 24 && d.Sexo == 'Masculino').length},
	{age: "20-24", sex: "F", value: detailedDeathsData.filter(d => d.Idade >= 20 && d.Idade <= 24 && d.Sexo == 'Feminino').length},
	{age: "15-19", sex: "M", value: detailedDeathsData.filter(d => d.Idade >= 15 && d.Idade <= 19 && d.Sexo == 'Masculino').length},
	{age: "15-19", sex: "F", value: detailedDeathsData.filter(d => d.Idade >= 15 && d.Idade <= 19 && d.Sexo == 'Feminino').length},
	{age: "10-14", sex: "M", value: detailedDeathsData.filter(d => d.Idade >= 10 && d.Idade <= 14 && d.Sexo == 'Masculino').length},
	{age: "10-14", sex: "F", value: detailedDeathsData.filter(d => d.Idade >= 10 && d.Idade <= 14 && d.Sexo == 'Feminino').length},
	{age: "5-9", sex: "M", value: detailedDeathsData.filter(d => d.Idade >= 5 && d.Idade <= 9 && d.Sexo == 'Masculino').length},
	{age: "5-9", sex: "F", value: detailedDeathsData.filter(d => d.Idade >= 5 && d.Idade <= 9 && d.Sexo == 'Feminino').length},
	{age: "<5", sex: "M", value: detailedDeathsData.filter(d => d.Idade < 5 && d.Sexo == 'Masculino').length},
	{age: "<5", sex: "F", value: detailedDeathsData.filter(d => d.Idade < 5 && d.Sexo == 'Feminino').length}
	];

	const margin = {top: 10, right: 0, bottom: 20, left: 0};
	const gutter = 20;
	const height = 500;
	const width = 800;

	const xM = d3.scaleLinear()
	.domain([0, d3.max(pyramidData, d => d.value)])
	.rangeRound([width / 2, margin.left])

	const xF = d3.scaleLinear()
	.domain(xM.domain())
	.rangeRound([width / 2, width - margin.right])

	const y = d3.scaleBand()
	.domain(pyramidData.map(d => d.age))
	.rangeRound([height - margin.bottom, margin.top])
	.padding(0.3)

	const xAxisM = g => g
	.attr("transform", `translate(-${gutter},${height - margin.bottom})`)
	.call(g => g.append("g").call(d3.axisBottom(xM).ticks(width / 80, "s")))
	.call(g => g.selectAll(".tick text").attr("fill", "#999"))
	.call(g => g.selectAll(".tick line").attr("stroke", "#999"))
	.call(g => g.selectAll(".domain").remove())
	.call(g => g.selectAll(".tick:first-of-type").remove())

	const xAxisF = g => g
	.attr("transform", `translate(${gutter},${height - margin.bottom})`)
	.call(g => g.append("g").call(d3.axisBottom(xF).ticks(width / 80, "s")))
	.call(g => g.selectAll(".tick text").attr("fill", "#999"))
	.call(g => g.selectAll(".tick line").attr("stroke", "#999"))
	.call(g => g.selectAll(".domain").remove())
	.call(g => g.selectAll(".tick:first-of-type").remove())

	const yAxis = g => g
	.attr("transform", `translate(${xM(12)},0)`)
	.call(d3.axisRight(y).tickSizeOuter(0))
	.call(g => g.selectAll(".tick text").attr("fill", "#999"))
	.call(g => g.selectAll("path, line").remove())

	// Chart
	const svg = d3.select("#deathsByAgeAndGenderChart")
	.append("svg")
	.attr("viewBox", [0, 0, width, height])
	.attr("width", "60vw")
	.attr("height", "500")
	.attr("font-family", "sans-serif")

	// Bars for the male dataset
	svg.append("g")
	.selectAll("rect")
	.data(pyramidData.filter(d => d.sex === "M"))
	.join("rect")
	.attr("transform", `translate(-${gutter},0)`)
	.attr("fill", "#26b1fe")
	.attr("x", d => xM(d.value))
	.attr("y", d => y(d.age))
	.attr("width", d => xM(0) - xM(d.value))
	.attr("height", y.bandwidth());

	// Bars for the female dataset
	svg.append("g")
	.selectAll("rect")
	.data(pyramidData.filter(d => d.sex === "F"))
	.join("rect")
	.attr("transform", `translate(${gutter},0)`)
	.attr("fill", "#f18330")
	.attr("x", d => xF(0))
	.attr("y", d => y(d.age))
	.attr("width", d => xF(d.value) - xF(0))
	.attr("height", y.bandwidth());

	// Bar values
	svg.append("g")
	.attr("fill", "white")
	.selectAll("text")
	.data(pyramidData)
	.join("text")
	.attr("text-anchor", d => d.sex === "M" ? "start" : "end")
	.attr("style","font-size: 8pt")
	.attr("x", d => d.sex === "M" ? xM(d.value) - gutter - (d.value > 99 ? 20 : 15) : xF(d.value) + gutter + (d.value > 99 ? 20 : 15))
	.attr("y", d => y(d.age) + y.bandwidth() / 2)
	.attr("dy", "0.35em")
	.text(d => d.value);

	// Bar values by percentage
	svg.append("g")
	.attr("fill", "#999")
	.selectAll("text")
	.data(pyramidData)
	.join("text")
	.attr("text-anchor", d => d.sex === "M" ? "start" : "end")
	.attr("style","font-size: 8pt")
	.attr("x", d => d.sex === "M" ? xM(d.value) - gutter - (d.value > 99 ? 60 : 55) : xF(d.value) + gutter + (d.value > 99 ? 60 : 55))
	.attr("y", d => y(d.age) + y.bandwidth() / 2)
	.attr("dy", "0.35em")
	.text(d => d.sex === "M" ? '(' + ((d.value / detailedDeathsData.length) * 100).toFixed(2) + '%) ':' (' + ((d.value / detailedDeathsData.length) * 100).toFixed(2) + '%)');

	// Label for the male dataset
	svg.append("text")
	.attr("text-anchor", "end")
	.attr("fill", "#fff")
	.attr("dy", "0.35em")
	.attr("x", xM(0) - gutter - 5)
	.attr("y", y(pyramidData[0].age) + y.bandwidth() / 2)
	.text("Masculino");

	// Label for the female dataset
	svg.append("text")
	.attr("text-anchor", "start")
	.attr("fill", "#fff")
	.attr("dy", "0.35em")
	.attr("x", xF(0) + gutter + 5)
	.attr("y", y(pyramidData[0].age) + y.bandwidth() / 2)
	.text("Feminino");

	// Legends for the X and Y axis
	svg.append("g")
	.call(xAxisM);

	svg.append("g")
	.call(xAxisF);

	svg.append("g")
	.call(yAxis);
}

function calcDifference(newValue, oldValue) {
	if (oldValue != 0) {
		return (newValue - oldValue) / oldValue * 100;
	} else {
		return - newValue * 100;
	}
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

function dateDifference(firstDate, secondDate) {
	const diffTime = Math.abs(new Date(secondDate) - new Date(firstDate));
	const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

	return diffDays;
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

/* Loading screen */

function PathLoader( el ) {
	this.el = el;
	// clear stroke
	this.el.style.strokeDasharray = this.el.style.strokeDashoffset = this.el.getTotalLength();
}

PathLoader.prototype._draw = function( val ) {
	this.el.style.strokeDashoffset = this.el.getTotalLength() * ( 1 - val );
}

PathLoader.prototype.setProgress = function( val, callback ) {
	this._draw(val);
	if( callback && typeof callback === 'function' ) {
		// give it a time (ideally the same like the transition time) so that the last progress increment animation is still visible.
		setTimeout( callback, 200 );
	}
}

PathLoader.prototype.setProgressFn = function( fn ) {
	if( typeof fn === 'function' ) { fn( this ); }
}

var simulationFn = function(instance) {
	var progress = 0,
		interval = setInterval( function() {
			progress = Math.min( progress + Math.random() * 0.1, 1 );
			instance.setProgress( progress );
			// reached the end
			if( progress === 1 ) {
				clearInterval( interval );
			}
		}, 100 );
};

function initLoadingScreen() {	
	var onEndInitialAnimation = function() {
		if( support.animations ) {
			this.removeEventListener( animEndEventName, onEndInitialAnimation );
		}

		startLoading();
	};

	// initial animation
	classie.add( container, 'loading' );

	if( support.animations ) {
		container.addEventListener( animEndEventName, onEndInitialAnimation );
	}
	else {
		onEndInitialAnimation();
	}
}

function startLoading() {
	// simulate loading something..
	var simulationFn = function(instance) {
		var progress = 0,
			interval = setInterval( function() {
				progress = Math.min( progress + Math.random() * 0.1, 1 );

				instance.setProgress( progress );

				// reached the end
				if( progress === 1 ) {
					classie.remove( container, 'loading' );
					classie.add( container, 'loaded' );
					clearInterval( interval );

					var onEndHeaderAnimation = function(ev) {
						if( support.animations ) {
							if( ev.target !== header ) return;
							this.removeEventListener( animEndEventName, onEndHeaderAnimation );
						}

						classie.add( document.body, 'layout-switch' );
					};

					if( support.animations ) {
						header.addEventListener( animEndEventName, onEndHeaderAnimation );
					}
					else {
						onEndHeaderAnimation();
					}
					window.scrollTo( 0, 0 );
					$('body').css('overflow','auto');
				}
			}, 80 );
	};

	loader.setProgressFn( simulationFn );
}
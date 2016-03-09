Template.RDRWidget.helpers({
  metrics: function() {
    return Settings.metrics;
  },
  isSorted: function() {
    return this.name === Template.parentData().sortMetric ? 'sorted' : 'not-sorted';
  },
  granularityName: function(){
    return Template.currentData().granularity === Settings.COMPANIES_BY_TYPE ? "Company" : "Service";
  },
  contextName: function(){
    var g = Template.currentData().granularity;
    if ( g === Settings.SERVICES_BY_CATEGORY ) {
      return "Company";
    } else if (g === Settings.SERVICES_BY_COMPANY ) {
      return "Category";
    } else {
      return "";
    }
  },
  sliceDescription: function(){
    var g = Template.currentData().granularity;
    if ( g  === Settings.SERVICES_BY_COMPANY ) {
      return Template.currentData().company;
    } else if (g === Settings.SERVICES_BY_CATEGORY) {
      return Template.currentData().category;
    } else if (g === Settings.COMPANIES_BY_TYPE){
      return Template.currentData().companyType;
    } else {
      console.log("Unknown granularity: " + g);
      return "";
    }
  }
});

Template.RDRWidget.onCreated(function() {
  var template = this;
  template.autorun(function() {
    template.subscribe('ranking_digital_rights_services',{});
    template.subscribe('ranking_digital_rights_companies',{});
  });
});

Template.RDRWidget.onRendered(function() {
  var template = this;
  var pieColors = d3.scale.category10();
  var $serviceList = template.$('table tbody');
  template.autorun(function() {
    if (!template.subscriptionsReady()) { return; }

    var granularity = Template.currentData().granularity;
    var category    = Template.currentData().category;
    var companyName = Template.currentData().company;
    var companyType = Template.currentData().companyType;

    console.log("companyType: ", companyType);
    
    var sort = Template.currentData().sortMetric;
    var $metrics, serviceSlug, data, selector, cell, records, contextKey;

    $serviceList.empty();

    if (granularity === Settings.COMPANIES_BY_TYPE){
      records = RDRCompanyData.find( {type: companyType}).fetch();
      contextKey = 'type';
    } else if ( granularity === Settings.SERVICES_BY_COMPANY ){
        records = RDRServiceData.find({ company: companyName} ).fetch();
      contextKey = 'category';
    } else if (granularity === Settings.SERVICES_BY_CATEGORY) {
      records = RDRServiceData.find({ category: category }).fetch();
      contextKey = 'company';
    } else {
      console.log("Error: Unknown granularity " + granularity);
    }

    records = _.sortBy(records, function(record) {
      return _.findWhere(record.metrics, { name: sort }).value*-1;
    });

    records.forEach(function(record) {
      var name = record.name;
      // disambiguate between services in multiple categories that may now be presented 
      var id   = record.category ? record.name + record.category : record.name;
      var context = contextKey === "type" ? "" : record[contextKey];
      serviceSlug = s.slugify(id);
      $serviceList.append(
        '<tr class="service service-' + serviceSlug + '">' +
          '<td><div class="service">' + name +  (_.contains(['Mobile','Fixed broadband'],record.category) ? ' (' + record.country +')' : '') + '</div><div class="company">' + context + '</div></td>' + '</tr>');
      selector = '.service-' + serviceSlug;
      metricsNode = template.find(selector);
      Settings.metrics.forEach(function(metric) {
        var metricData = _.findWhere(record.metrics, { name: metric.name });
        data = [metricData.value, 100.0 - metricData.value];
        cell = $('<td>').addClass('text-center').appendTo(metricsNode).get(0);
        radius = metric.name === Settings.totalMetric ?
          Settings.pie.totalRadius : Settings.pie.radius;
        drawGraph(cell, data, radius, pieColors(metric.name));
      });
    });
  });
});

function drawGraph(parent, data, radius, color) {
  
  var width     = radius,
      height    = radius +20;
  var pieRadius = radius / 2;

  var arc = d3.svg.arc()
    .outerRadius(pieRadius)
    .innerRadius(Settings.pie.innerRadius);

  var pie = d3.layout.pie().startAngle(Math.PI).endAngle(3 * Math.PI).sort(null);

  var svg = d3.select(parent).append("svg")
    .attr("width", width)
    .attr("height", height)
    .append("g")
    .attr("transform", "translate(" + radius / 2 + "," + radius / 2 + ")");

  var g = svg.selectAll(".arc")
      .data(pie([data[0],data[1]]))
    .enter().append("g")
    .attr("class", "arc");

  g.append("path")
    .attr("d", arc)
    .style("fill", function(d, i) {
      return i === 0 ? color: Settings.pie.background;
    });

  svg.append('text')
    .attr('text-anchor', 'middle')
    .attr('y', 4)
    .text(Math.round(data[0]));

}

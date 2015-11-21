GSMAData.attachSchema(new SimpleSchema({
  start: { type: Date },
  value: { type: Number, decimal: true },
  metric: { type: String },
  attribute: { type: String },
  geo: { type: Object },
  'geo.type': { type: String },
  'geo.code': { type: String }
}));

Settings = {
  updateEvery: moment.duration({ months: 6 }),
  authToken: Assets.getText('apiKey.txt'),
  timeout: 60 * 1000,
  limit: 20
};

var Future = Npm.require('fibers/future');
var get = Future.wrap(HTTP.get);
var attrUrls = [
  'https://api.gsmaintelligence.com/zones/data?metric.id=3&attribute.id=0',
  'https://api.gsmaintelligence.com/zones/data?metric.id=53&attribute.id=99',
  'https://api.gsmaintelligence.com/zones/data?metric.id=53&attribute.id=755',
  'https://api.gsmaintelligence.com/zones/data?metric.id=53&attribute.id=799'
];

function mungeGeo(geo) {
  var newGeo = {
    type: geo.type.replace('zone/', ''),
    code: ''
  };
  if (newGeo.type === 'country') {
    newGeo.code = geo.href.replace('/zones?isoCode=', '');
  } else {
    newGeo.code = geo.href;
  }

  return newGeo;
}

function insertDatum(value, metric, attr, geo) {
  if (value.dateType !== 'Q' ||
      value.confidence === 'forecast') { return; }

  var datum = {
    start: new Date(value.date),
    value: value.value,
    metric: metric,
    attribute: attr,
    geo: geo
  };

  try {
    GSMAData.insert(datum);
  } catch (e) {
    console.error(e);
  }
}

function updateGSMAData() {
  console.log('GSMA: Fetching new data');
  GSMAData.remove({});
  var result, metric, attr, geo, url, totalSets, skip;

  _.each(attrUrls, function(attrUrl) {
    totalSets = 1;
    skip = 0;

    while(skip < totalSets) {
      try {
        url = attrUrl + '&_limit=' + Settings.limit + '&_skip=' + skip;
        console.log(url);
        result = get(url, {
          headers: { 'X-APP-KEY': Settings.authToken },
          timeout: Settings.timeout
        }).wait();
      } catch(error) {
        console.error('GSMA: Fetch error');
        console.error(error);
        throw new Error(error);
      }

      _.each(result.data.items, function(item) {
        metric = _.findWhere(item._links, { rel: 'metric' }).href;
        attr = _.findWhere(item._links, { rel: 'attribute' }).href;
        geo = mungeGeo(_.findWhere(item._links, { rel: 'refers-to' }));

        _.each(item.values, function(value) {
          insertDatum(value, metric, attr, geo);
        });
      });

      totalSets = result.data.totalSets;
      skip += Settings.limit;
    }
  });
  console.log('GSMA: Fetched new data');
}

if (Meteor.settings.doJobs) {
  if (GSMAData.find().count() === 0 ||
      GSMAData.findOne({}, { sort: { start: -1 } }).start +
      Settings.updateEvery.asMilliseconds() < Date.now()) {
    Future.task(updateGSMAData);
  } else {
    console.log('GSMA: Not updating data');
  }
}

Meteor.publish('gsma_data', function(geoCode, metric, attr) {
  var publication = this;
  var values = GSMAData.find(
      { 'geo.code': geoCode, metric: metric, attribute: attr },
      { sort: { start: 1 }});

  var baseline;

  values.forEach(function(datum, i) {
    if (i === 0) {
      baseline = datum.value;
    }
    var percentChange = datum.value / baseline - 1.0;
    var id = geoCode + metric + attr + datum.start.toString();
    publication.added('gsma_data', id, {
      start: datum.start,
      value: percentChange,
      geoCode: geoCode,
      metric: metric,
      attr: attr
    });
  });
  publication.ready();
});
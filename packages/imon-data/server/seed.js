var Future = Npm.require('fibers/future');

console.log("REINOS: hacking imon seed.js to death. We must get better indicator metadata.");

function fetchData() {
  console.log('IMon Data: Fetching data');
  var Store = Npm.require('jsonapi-datastore').JsonApiDataStore;
  var store = new Store();

  var baseUrl = 'https://imon.dev.berkmancenter.org/v1/';

  var futures = [];

  ['datum_sources', 'countries', 'regions'].forEach(function(type) {
    var fut = HTTP.get.future()(baseUrl + type, { timeout: Settings.timeout });
    futures.push(fut);
    var results = fut.wait();
    store.sync(results.data);
  });

  Future.wait(futures);

  console.log('IMon Data: Inserting data');

  _.each(store.findAll('regions'), insertRegion);
  _.each(store.findAll('countries'), insertCountry);
  _.each(store.findAll('datum_sources'), insertIndicator);
  
  console.log('IMon Data: Fetched data');
}

function countryUrl(iso3Code) {
  return Settings.baseUrl + '/countries/' + iso3Code;
}
function imageUrl(iso3Code) {
  return countryUrl(iso3Code) + '/thumb';
}
function accessUrl(iso3Code) {
  return countryUrl(iso3Code) + '/access';
}
function insertCountry(c) {
  insertArea(c, false);
}
function insertRegion(r) {
  insertArea(r, true);
}

function insertArea(a, isRegion) {
  isRegion = isRegion || false;
  var code = a.iso3_code.toLowerCase().slice(0, 3);

  var country = {
    name: a.name,
    code: code,
    rank: a.rank,
    score: a.score,
    isRegion: isRegion,
    dataSources: []
  };

  if (!isRegion) {
    _.extend(country, {
      iso2Code: a.iso_code.toLowerCase(),
      accessUrl: accessUrl(code),
      imageUrl: imageUrl(code)
    });
  }

  try {
    IMonCountries.upsert({ code: code }, { $set: country });
  } catch (e) {
    console.error('IMon Data: Error inserting data');
    console.error(e);
    throw e;
  }
  
  _.each(a.indicators, function(i) {
    // it's confusing that the individual data points are called indicators
    var datum = {
      countryCode: code,
      imId: i.id,
      sourceId: i.datum_source.id,
      startDate: new Date(i.start_date),
      name: i.datum_source.public_name,
      value: i.original_value,
      percent: i.value
    };

    try {
      IMonData.upsert({ countryCode: code, imId: i.id }, { $set: datum });
      IMonCountries.update({ code: code },
          { $addToSet: { dataSources: i.datum_source.id }});
    } catch (e) {
      console.error('IMon Data: Error inserting data');
      console.error(e);
      throw e;
    }
  });
}

function insertIndicator(i){
  console.log("REINOS: insertDatumSource aka indicator: " ,i);
  var indicator = {
    id: parseInt(i.id),
    name: i.public_name,
    shortName: i.short_name ? i.short_name : i.public_name,
    sourceName: i.source_name,
    sourceUrl: i.source_url ? i.source_url : 'https://thenetmonitor.org/sources/dashboard-data',
    description: i.description,
    min: i.min,
    max: i.max,
    displayPrefix: i.display_prefix
  };
  
  try {
    console.log('Upserting indicator data:',indicator);
    IMonIndicators.upsert({ id: indicator.id }, { $set: indicator });
  } catch (e) {
    console.error('IMon Data: Error upserting indicator data');
    console.error(e);
    throw e;
  }
}

if (Meteor.settings.doJobs) {
  if (IMonCountries.find().count() === 0) {
    Future.task(fetchData);
  } else {
    // REINOS: Force data refetch. Is there a way I can force this from the console?
    Future.task(fetchData);
  }
  Meteor.setInterval(fetchData.future(), Settings.updateEvery);
}

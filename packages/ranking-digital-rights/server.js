
function parseServiceData(companyMap){
  console.log("RankingDigitalRights: Loading service data");
  var csvParse = Npm.require('csv-parse');
  var csvText = Assets.getText('rdr_index.csv');
  Meteor.wrapAsync(csvParse)(
    csvText,
    { columns: true, auto_parse: true },
    function(err, output) {
      if (err) {
        console.error('RankingDigitalRights: Error parsing service data from cvs file!', error);
        return;
      }
      var service_metrics = [];
      output.forEach(function(row) {
        var company = companyMap[row.company];
        service_metrics.push({ name: row.metric, value: row.value, rank: row.rank });
        if (service_metrics.length < 4) {
          // still collecting metrics...
          // when we have four, we will have them all and can insert!
          return;
        }
        try {
          RDRServiceData.insert({
            category: row.category,
            name: row.service,
            company: company.name,
            country: company.country,
            metrics: service_metrics
          });
          service_metrics = [];
        } catch (error) {
          console.error("ranking digital rights: Error inserting service data into Mongo!",error);
        }
      });
    });
}

function parseCompanyData() {
  console.log("RankingDigitalRights: Loading company data");
  var tsvParse = Npm.require('csv-parse');
  var tsvText  = Assets.getText('rdr_companies.tsv');
  var companyMap={};
  var metricKeys = ['Total','Commitment','Freedom of expression','Privacy'];
  var companyCount=0;
  Meteor.wrapAsync(tsvParse)(
    tsvText,
    {columns: true, auto_parse: true, delimiter: '\t'},
    function(err,output){
      if(err){
        console.error('RankingDigitalRights: Error parsing company data from tsv file!', error);
        return;
      }
      output.forEach(function(row){
        companyCount++;
        var metrics = [];
        _.each(metricKeys,function(key){
          metrics.push({ name: key , value: row[key] });
        });
        var company = {
          name: row.company,
          country: row.country,
          metrics: metrics,
          type: row.company_type
        };
        companyMap[company.name]=company;
        try {
          RDRCompanyData.insert(company);
        } catch (error){
          console.error("RankingDigitalRights: Error inserting service data into Mongo!",error);
        }
      });
      // now that we're sure that we're done with companydata, load service data.
      parseServiceData(companyMap);
    });
}

function parseData(){
  parseCompanyData();
}

if (Meteor.settings.doJobs) {
  RDRCompanyData.remove({});
  RDRServiceData.remove({});
  parseData();
}

Meteor.publish('ranking_digital_rights_services', function(query) {
  return RDRServiceData.find(query);
});

Meteor.publish('ranking_digital_rights_companies', function(query) {
  return RDRCompanyData.find(query);
});



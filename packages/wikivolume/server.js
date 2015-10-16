Settings.jobQueue = 'wiki_edit_count';
BinnedWikiEdits._createCappedCollection(Settings.maxBinSpace, Settings.maxBinNum);
BinnedWikiEdits._ensureIndex({ binStart: 1 },
    { expireAfterSeconds: Settings.binWidth / 1000 * Settings.numBins });
BinnedWikiEdits._ensureIndex({ channel: 1, binWidth: 1 });

var fetchBin = function(channel, since) {
  var and = [ { created: { $gt: since } }, { namespace: 'article' } ];
  if (channel !== '#all') {
    and.push({ channel: channel });
  }

  var pipeline = [
    { $match: {
      $and: and
    } },
    { $group: {
      _id: null,
      count: { $sum: 1 }
    } }
  ];

  var result = WikiEdits.aggregate(pipeline);
  if (result[0]) {
    return result[0];
  }
  return { _id: null, count: 0 };
};

var insertBin = function(channel, binWidth) {
  channel = channel || Settings.defaultChannel.channel;
  binWidth = binWidth || Settings.binWidth;

  var binStart = Date.now();
  var binEnd = new Date(binStart - binWidth);
  var bin = fetchBin(channel, binEnd);

  _.extend(bin, {
    binWidth: binWidth,
    binStart: binStart,
    channel: channel
  });

  BinnedWikiEdits.insert(bin);
  return bin;
};

Meteor.publish('wikiedits_binned', function(channel, binWidth) {
  var data = { channel: channel, binWidth: binWidth };
  var cursor = BinnedWikiEdits.find({ channel: channel, binWidth: binWidth },
      { limit: Settings.numBins, sort: { binStart: -1 } });

  if (!WidgetJob.exists(Settings.jobQueue, data)) {
    var job = new WidgetJob(Settings.jobQueue, data);
    job.repeat({ wait: Settings.updateEvery }).save();
    console.log('WikiVolume: Added binning job - ' + channel + ' ' + binWidth);
    this.connection.onClose(function() {
      job.cancel();
      job.remove();
      console.log('WikiVolume: Removed binning job - ' + channel + ' ' + binWidth);
    });
  }

  return cursor;
});

WikiEditCounts.widget.jobs = {
  wiki_edit_count: function(data) { insertBin(data.channel, data.binWidth); }
};
Meteor.startup(function() {
  if (Meteor.settings.doJobs) {
    var data = {
      channel: Settings.defaultChannel.channel,
      binWidth: Settings.binWidth
    };
    if (!WidgetJob.exists(Settings.jobQueue, data)) {
      var job = new WidgetJob(Settings.jobQueue, data);
      job.repeat({ wait: Settings.updateEvery }).save();
    }
  }
});

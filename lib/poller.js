const _ = require("lodash");
const { from, of, combineLatest, timer, interval } = require("rxjs");
const { mergeMap, filter, map, retry, catchError, delayWhen, } = require("rxjs/operators");
const { DateTime } = require("luxon");
const { config } = require("./config");
const api = require("./api");

const WEEKDAYS = {
  FRI: 5,
  SAT: 6,
  SUN: 7
}

const MINIMAL_POLLING_INTERVAL = 15000;
const MINIMAL_AUTHENTICATION_INTERVAL = 3600000;

module.exports = {
  pollFavoriteBusinesses$,
};

function pollFavoriteBusinesses$(enabled$) {
  const authenticationByInterval$ = authenticateByInterval$();
  return listFavoriteBusinessesByInterval$(authenticationByInterval$, enabled$);
}

function authenticateByInterval$() {
  const authenticationIntervalInMs = getInterval(
    "api.authenticationIntervalInMS",
    MINIMAL_AUTHENTICATION_INTERVAL
  );

  return timer(0, authenticationIntervalInMs).pipe(
    mergeMap(() =>
      from(api.login()).pipe(
        retry(2),
        catchError(logError),
        filter((authentication) => !!authentication)
      )
    )
  );
}

function listFavoriteBusinessesByInterval$(
  authenticationByInterval$,
  enabled$
) {
  const pollingIntervalInMs = getInterval(
    "api.pollingIntervalInMs",
    MINIMAL_POLLING_INTERVAL
  );
  return combineLatest(
    enabled$,
    timer(0, pollingIntervalInMs),
    authenticationByInterval$
  ).pipe(
    filter(([enabled]) => enabled),
    filter(() => shouldRunNow()),
    delayWhen(() => interval(getDelay())),

    mergeMap(() =>
      from(api.listFavoriteBusinesses()).pipe(
        retry(2),
        catchError(logError),
        filter((response) => !!_.get(response, "items")),
        map((response) => response.items)
      )
    )
  );
}

function logError(error) {
  if (error.options) {
    console.error(`Error during request:
${error.options.method} ${error.options.url.toString()}
${JSON.stringify(error.options.json, null, 4)}

${error.stack}`);
  } else if (error.stack) {
    console.error(error.stack);
  } else {
    console.error(error);
  }
  return of(null);
}

function getInterval(configPath, minimumIntervalInMs) {
  const configuredIntervalInMs = config.get(configPath);
  return _.isFinite(configuredIntervalInMs)
    ? Math.max(configuredIntervalInMs, minimumIntervalInMs)
    : minimumIntervalInMs;
}


function shouldRunNow() {
  const now = DateTime.now().setZone("America/Toronto");
  const { weekday, hour } = now;
  // don't run on FRI/SAT
  if ([WEEKDAYS.FRI, WEEKDAYS.SAT].includes(weekday)) {
      return false;
  }
  // don't run between 10 PM and 8:59 AM
  if (hour < 9 || hour >= 22) {
      return false;
  }
  return true;
}

function getDelay() {
  return Math.random() * 30_000;
}

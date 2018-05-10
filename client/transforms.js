export default class TransformService {
  constructor(UtilsService) {
    this._UtilsService = UtilsService;
    this._serverToDbWorker = new Worker("/assets/workers/transform-to-db.js");
    this._dbToAppWorker = new Worker("/assets/workers/transform-to-app.js");
  }

  _getOnMessagePromisesFactory(worker) {
    return () =>
      new Promise(
        resolve => console.log(worker.onmessage) || (worker.onmessage = resolve)
      ).then(event => event.data);
  }

  serverToDBFormat(serverData, chunkSize) {
    const yScaleFactor = 1;
    const resultsLength = 1;

    return this._getResultIterator(
      this._serverToDbWorker,
      serverData,
      yScaleFactor,
      chunkSize,
      resultsLength
    );
  }

  dbToCanvasFormat(dbData, yScaleFactor, chunkSize) {
    return this._getResultIterator(
      this._dbToAppWorker,
      dbData,
      yScaleFactor,
      chunkSize
    );
  }

  _getResultIterator(
    worker,
    values,
    yScaleFactor,
    chunkSize = 1,
    resultsLength = values.length
  ) {
    const results = this._UtilsService.getObjArray(
      Math.ceil(resultsLength / chunkSize)
    );

    const iterator = function*() {
      for (let i = 0; i < results.length; i++) {
        yield results[i];
      }
    };

    worker.postMessage({ values, yScaleFactor, chunkSize });

    return new Promise(resolve => {
      let resultsCounter = 0;
      worker.onmessage = event => {
        if (resultsCounter > results.length) {
          return;
        }

        results[resultsCounter++] = event.data;

        if (resultsCounter === results.length) {
          resolve(iterator);
        }
      };
    });
  }
}

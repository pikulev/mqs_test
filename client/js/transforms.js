/*
 * TransformService
 * 
 * */
export default class TransformService {
  constructor(UtilsService) {
    this._UtilsService = UtilsService;
    this._serverToDbWorker = new Worker("/js/workers/transform-to-db.js");
    this._dbToAppWorker = new Worker("/js/workers/transform-to-app.js");
  }

  /*
  * Даёт итератор по странсформированным данным для записи в БД
  * public
  * */
  serverToDBFormat(serverData, chunkSize) {
    const yScaleFactor = 1;
    const resultsLength = 1;

    return this._getResultIterator(this._serverToDbWorker, serverData, yScaleFactor, chunkSize, resultsLength);
  }

  /*
  * Даёт итератор по странсформированным данным для вывода на холст
  * public
  * */
  dbToCanvasFormat(dbData, yScaleFactor, chunkSize) {
    return this._getResultIterator(this._dbToAppWorker, dbData, yScaleFactor, chunkSize);
  }

  /*
  * Реализует логику трансформации данных через указанный воркер
  * Принимает также yScaleFactor, chunkSize - для масштабирования / усреднения
  * и resultsLength - сколько результатов ожидаем (так как иногда одтаем массив, а ожидаем один объект в результате)
  * private
  * */
  _getResultIterator(worker, values, yScaleFactor, chunkSize = 1, resultsLength = values.length) {
    const results = this._UtilsService.getObjArray(Math.ceil(resultsLength / chunkSize));

    const iterator = function*() {
      for (let i = 0; i < results.length; i++) {
        yield results[i];
      }
    };

    worker.postMessage({ values, yScaleFactor, chunkSize });

    // вернет промис
    return new Promise(resolve => {
      let resultsCounter = 0;

      // отловит все сообщения от воркера
      worker.onmessage = event => {
        if (resultsCounter > results.length) {
          return;
        }

        // запишет результат в буффер
        results[resultsCounter++] = event.data;

        // и отдаст итератор по этому буфферу
        if (resultsCounter === results.length) {
          resolve(iterator);
        }
      };
    });
  }
}

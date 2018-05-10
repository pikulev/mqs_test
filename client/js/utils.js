/*
  * UtilsService
  * 
  * */
export class UtilsService {
  constructor() {}

  /*
  * Отдаст преаллоцированный и предзаполненый массив нужной длины
  * publis
  * */
  getObjArray(count) {
    return Array.apply(null, Array(count)).map(Object.prototype.valueOf, {});
  }
}

onmessage = event => {
  const values = getAveragedValues(event.data.values, event.data.chunkSize);

  for (let i = 0; i < values.length; i++) {
    postMessage({ label: values[i].t, value: values[i].v });
  }
};

function getAveragedValues(array, chunkSize) {
  return Array(Math.ceil(array.length / chunkSize))
    .fill()
    .map((_, i) => array.slice(i * chunkSize, i * chunkSize + chunkSize))
    .map(chunk => {
      const chunkLength = chunk.length;
      const sum = chunk.reduce((prev, next) => prev + next.v, 0);
      const midIndex = Math.floor(chunkLength / 2);

      return { t: chunk[midIndex].t, v: sum / chunkLength };
    });
}

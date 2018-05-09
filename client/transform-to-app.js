onmessage = event => {
  const len = event.data.length;
  postMessage({ len });
  
  event.data.forEach(item => {
    const result = { label: item.t, value: item.v };
    postMessage({ result });
  });
};

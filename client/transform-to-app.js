onmessage = event => {
  console.log("Message received from main script", event);

  console.log(event.data);
  const result = (event.data || [])
    .reduce((prev, next = {value: []}) => prev.concat(...next.value), [])
    .map(item => ({ label: item.t, value: item.v }));

  postMessage(result);
  console.log("Message posted back to main script");
};

const fs = require('fs');

const WORKER_URL = 'https://swiftglass-crm.skifchaqwerty.workers.dev';
// we need to bypass token maybe? Or token is local. Let's see if we can just GET orders.
async function run() {
  const res = await fetch(`${WORKER_URL}/api/orders`);
  console.log(res.status);
  const data = await res.json();
  const o = data.data ? data.data[0] : data[0];
  console.log(o);
}
run();

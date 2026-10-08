import { INestApplication } from '@nestjs/common';

// Starts the app on an ephemeral port bound to 127.0.0.1, in place of `init()`. Without a listening server
// supertest calls `listen(0)` on the wildcard address, and on macOS the kernel may hand out a port another
// process already holds on 127.0.0.1 (an IDE, a dev tool); the request then reaches that process and the
// test gets a stray 301/404/503. Binding the loopback address makes the kernel skip such ports.
export async function listenOnLoopback(app: INestApplication) {
  await app.listen(0, '127.0.0.1');
}

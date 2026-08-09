# subatom-utils

Zero-dependency builtin utilities for the **Subatom** backend framework —
`hash()`, `uuid()`, `slug()`, `sleep()`, `random()`, `env()`. Everything
is implemented with Node's built-in `crypto` module, so there's nothing
extra to install at runtime.

## Layout

```
src/
  hash.ts    hash(), hash.password(), hash.verify(), hash.hmac()
  uuid.ts    uuid(), uuid.short(), uuid.isValid()
  slug.ts    slug()
  sleep.ts   sleep(), sleep.until(), sleep.abortable()
  random.ts  random(), random.int(), random.string(), random.bool(),
             random.item(), random.shuffle()
  env.ts     env(), env.require(), env.number(), env.bool(),
             env.array(), env.json(), env.is() / isProduction() / isDevelopment() / isTest()
  index.ts   re-exports everything
  demo.ts    runnable smoke test for all of the above
```

## Integrating into Subatom

Drop the `src/` files into your framework (e.g. `packages/core/src/utils/`)
and re-export them from wherever Subatom exposes its builtins:

```ts
// subatom/index.ts
export { hash, uuid, slug, sleep, random, env } from './utils';
```

If your framework attaches builtins to a global/context object instead of
plain exports, just spread them in:

```ts
import * as builtins from './utils';

app.context.utils = { ...builtins };
```

## Usage

```ts
import { hash, uuid, slug, sleep, random, env } from 'subatom';

hash('some string');                       // sha256 hex digest
hash('some string', { algorithm: 'md5' }); // md5 hex digest
const pw = hash.password('s3cret');        // salted scrypt hash for storage
hash.verify('s3cret', pw);                 // true

uuid();            // 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
uuid.short(8);      // 'a1b2c3d4'

slug('Café déjà vu!'); // 'cafe-deja-vu'

await sleep(500);       // pause 500ms
await sleep.until(date);

random(1, 100);          // random int 1-100
random.string(24);        // random token
random.item(['a','b']);   // pick one

env('PORT', '3000');          // string, with default
env.number('PORT', 3000);     // typed as number
env.require('DATABASE_URL');  // throws if missing
env.isProduction();
```

## Build

```
npm install
npm run build   # compiles src/ -> dist/
npm test        # runs src/demo.ts via tsx
```

## Design notes

- **`hash()`** is a plain fast digest (sha256 by default) — not for
  passwords. `hash.password()` / `hash.verify()` use `scrypt` with a
  random salt and constant-time comparison instead.
- **`uuid()`** uses `crypto.randomUUID()` (RFC 4122 v4), which has been
  built into Node since v14.17 — no `uuid` package needed.
- **`random()`** uses `crypto.randomInt()` for integers (cryptographically
  strong, unbiased) rather than `Math.random()`.
- **`env()`** never throws for optional lookups; only `env.require()` and
  the typed parsers (`env.number`, `env.json`, ...) throw, and only when
  the variable is present but invalid.

  ##

```ts
  import { hash, uuid, slug, sleep, random, env } from './index';

async function main() {
  console.log('hash():', hash('hello world'));
  console.log('hash({md5}):', hash('hello world', { algorithm: 'md5' }));
  const pw = hash.password('correct horse battery staple');
  console.log('hash.password():', pw);
  console.log('hash.verify() (correct):', hash.verify('correct horse battery staple', pw));
  console.log('hash.verify() (wrong):', hash.verify('nope', pw));

  console.log('uuid():', uuid());
  console.log('uuid.short():', uuid.short());
  console.log('uuid.isValid():', uuid.isValid(uuid()));

  console.log('slug():', slug('Café déjà vu — Node.js & TypeScript!'));

  console.log('random(1, 10):', random(1, 10));
  console.log('random.string(12):', random.string(12));
  console.log('random.item():', random.item(['a', 'b', 'c']));

  process.env.EXAMPLE_PORT = '4000';
  console.log('env.number("EXAMPLE_PORT", 3000):', env.number('EXAMPLE_PORT', 3000));
  console.log('env("MISSING_KEY", "fallback"):', env('MISSING_KEY', 'fallback'));

  console.log('sleeping for 200ms...');
  await sleep(200);
  console.log('done sleeping');
}

main();
```
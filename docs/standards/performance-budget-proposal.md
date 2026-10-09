# Proposed CI performance budgets — accepted

Calibration: [GitHub Actions run 37934846094](https://github.com/VoidReg/publisle/actions/runs/37934846094), repetitions 1–3, baseline commit `1753e9b526bee12c349420a82a0722968f011dd9`. Download the three `performance-calibration-37934846094-1-{1,2,3}` artifacts; inputs and commit hashes are verified before generating this table. Local copies remain in ignored `benchmarks/ci-calibration-{1,2,3}/`. CPU models: Intel(R) Xeon(R) 6973P-C; AMD EPYC 7763 64-Core Processor; AMD EPYC 9V74 80-Core Processor. Node v24.21.0; Chromium 153.0.8010.12. These values are the accepted reviewed budgets, enforced from `tools/benchmarks/accepted-budgets.json`. Do not edit the figures below to clear a gate.

Timing caps use the largest observed run p95 plus twice the largest run standard deviation, rounded upward to whole milliseconds. This is conservative headroom for review, not a confidence interval. Byte caps use the largest observation plus the larger of observed spread or 1% as an explicit small review allowance beyond observed identifier/compression variation. Review each allowance before acceptance.

| Workload                                      | Largest run p50 ms | Largest run p95 ms | Largest run sample variance ms² | Proposed p95 cap ms |
| --------------------------------------------- | ------------------ | ------------------ | ------------------------------- | ------------------- |
| static-100 prepare reused registry            | 19.765             | 23.298             | 2.290                           | 27                  |
| static-100 input clone                        | 0.217              | 0.243              | 0.022                           | 1                   |
| static-1000 prepare reused registry           | 186.923            | 205.110            | 44.132                          | 219                 |
| static-1000 input clone                       | 1.915              | 1.999              | 0.026                           | 3                   |
| static-10000 prepare reused registry          | 1822.815           | 1846.788           | 1279.334                        | 1919                |
| static-10000 input clone                      | 19.374             | 21.986             | 1.453                           | 25                  |
| registry construction                         | 67.851             | 68.168             | 10.671                          | 75                  |
| static-1000 prepare new registry              | 252.181            | 265.694            | 97.370                          | 286                 |
| static-1000 repeated same input               | 182.392            | 183.709            | 49.450                          | 198                 |
| static-1000 fixture construction              | 1.060              | 1.595              | 0.234                           | 3                   |
| static-1000 end-to-end                        | 259.130            | 274.556            | 46.030                          | 289                 |
| static-1000 publication serialization         | 2.374              | 2.757              | 0.041                           | 4                   |
| islands-5 prepare                             | 2.182              | 2.392              | 0.043                           | 3                   |
| repeated-100 prepare                          | 32.789             | 33.751             | 0.749                           | 36                  |
| distinct-20 prepare                           | 5.801              | 6.529              | 0.324                           | 8                   |
| inline-code-100kb prepare                     | 4.448              | 4.572              | 0.055                           | 6                   |
| corpus-10000 prepare                          | 2501.506           | 2511.501           | 1978.059                        | 2601                |
| contract-graph-1000 walk                      | 0.169              | 0.195              | 0.003                           | 1                   |
| static-1000 process-cold prepare              | 221.031            | 228.678            | 58.776                          | 245                 |
| static-1000 process start-to-exit             | 577.949            | 596.024            | 223.495                         | 626                 |
| react/native/1 × 2 firstActivationMs          | 51.683             | 53.980             | 23.183                          | 64                  |
| react/native/1 × 2 remainingActivationMs      | 7.223              | 15.518             | 9.292                           | 22                  |
| react/native/5 × 2 firstActivationMs          | 50.258             | 53.627             | 14.121                          | 62                  |
| react/native/5 × 2 remainingActivationMs      | 25.734             | 33.558             | 37.488                          | 46                  |
| react/native/100 × 2 firstActivationMs        | 53.711             | 56.703             | 17.965                          | 66                  |
| react/native/100 × 2 remainingActivationMs    | 160.022            | 176.644            | 72.211                          | 194                 |
| react/artifact/1 × 2 firstActivationMs        | 49.228             | 51.891             | 2.130                           | 55                  |
| react/artifact/1 × 2 remainingActivationMs    | 6.153              | 9.832              | 2.804                           | 14                  |
| react/artifact/5 × 2 firstActivationMs        | 49.832             | 54.507             | 2.935                           | 58                  |
| react/artifact/5 × 2 remainingActivationMs    | 24.537             | 28.772             | 21.681                          | 39                  |
| react/artifact/100 × 2 firstActivationMs      | 55.110             | 59.140             | 10.194                          | 66                  |
| react/artifact/100 × 2 remainingActivationMs  | 156.463            | 176.435            | 76.095                          | 194                 |
| svelte/native/1 × 2 firstActivationMs         | 45.059             | 46.952             | 39.149                          | 60                  |
| svelte/native/1 × 2 remainingActivationMs     | 5.630              | 19.480             | 13.464                          | 27                  |
| svelte/native/5 × 2 firstActivationMs         | 45.426             | 48.807             | 31.372                          | 61                  |
| svelte/native/5 × 2 remainingActivationMs     | 15.925             | 19.853             | 6.881                           | 26                  |
| svelte/native/100 × 2 firstActivationMs       | 49.322             | 60.615             | 137.901                         | 85                  |
| svelte/native/100 × 2 remainingActivationMs   | 117.192            | 125.610            | 810.082                         | 183                 |
| svelte/artifact/1 × 2 firstActivationMs       | 44.457             | 45.841             | 36.984                          | 59                  |
| svelte/artifact/1 × 2 remainingActivationMs   | 5.121              | 8.564              | 7.916                           | 15                  |
| svelte/artifact/5 × 2 firstActivationMs       | 45.420             | 47.224             | 46.794                          | 61                  |
| svelte/artifact/5 × 2 remainingActivationMs   | 18.647             | 23.969             | 24.348                          | 34                  |
| svelte/artifact/100 × 2 firstActivationMs     | 50.366             | 55.571             | 61.925                          | 72                  |
| svelte/artifact/100 × 2 remainingActivationMs | 111.025            | 115.572            | 14.590                          | 124                 |

| Reader fixture/metric                        | Observed min bytes | Observed max bytes | Proposed cap bytes |
| -------------------------------------------- | ------------------ | ------------------ | ------------------ |
| publisle static html                         | 51946              | 51946              | 52466              |
| publisle static html gzip                    | 2746               | 2746               | 2774               |
| islands-5 html                               | 2648               | 2648               | 2675               |
| repeated-100 html                            | 51256              | 51256              | 51769              |
| distinct-20 html                             | 6406               | 6406               | 6471               |
| inline-code-100kb html                       | 100156             | 100156             | 101158             |
| react/native/1 × 2 htmlBytes                 | 4437               | 4437               | 4482               |
| react/native/1 × 2 htmlGzipBytes             | 1216               | 1217               | 1230               |
| react/native/1 × 2 cssBytes                  | 2478               | 2478               | 2503               |
| react/native/1 × 2 propsBytes                | 2278               | 2278               | 2301               |
| react/native/1 × 2 initialJsBytes            | 226548             | 226548             | 228814             |
| react/native/1 × 2 activatedJsBytes          | 229973             | 229973             | 232273             |
| react/native/1 × 2 initialJsGzipBytes        | 70061              | 70061              | 70762              |
| react/native/1 × 2 activatedJsGzipBytes      | 71498              | 71499              | 72214              |
| react/native/5 × 2 htmlBytes                 | 10509              | 10509              | 10615              |
| react/native/5 × 2 htmlGzipBytes             | 1273               | 1277               | 1290               |
| react/native/5 × 2 cssBytes                  | 2478               | 2478               | 2503               |
| react/native/5 × 2 propsBytes                | 11382              | 11382              | 11496              |
| react/native/5 × 2 initialJsBytes            | 234572             | 234572             | 236918             |
| react/native/5 × 2 activatedJsBytes          | 237997             | 237997             | 240377             |
| react/native/5 × 2 initialJsGzipBytes        | 70359              | 70360              | 71064              |
| react/native/5 × 2 activatedJsGzipBytes      | 71797              | 71798              | 72516              |
| react/native/100 × 2 htmlBytes               | 154719             | 154719             | 156267             |
| react/native/100 × 2 htmlGzipBytes           | 2141               | 2143               | 2165               |
| react/native/100 × 2 cssBytes                | 2478               | 2478               | 2503               |
| react/native/100 × 2 propsBytes              | 227602             | 227602             | 229879             |
| react/native/100 × 2 initialJsBytes          | 425038             | 425038             | 429289             |
| react/native/100 × 2 activatedJsBytes        | 428463             | 428463             | 432748             |
| react/native/100 × 2 initialJsGzipBytes      | 75579              | 75587              | 76343              |
| react/native/100 × 2 activatedJsGzipBytes    | 77017              | 77023              | 77794              |
| react/artifact/1 × 2 htmlBytes               | 4590               | 4590               | 4636               |
| react/artifact/1 × 2 htmlGzipBytes           | 1259               | 1262               | 1275               |
| react/artifact/1 × 2 cssBytes                | 2478               | 2478               | 2503               |
| react/artifact/1 × 2 propsBytes              | 2278               | 2278               | 2301               |
| react/artifact/1 × 2 initialJsBytes          | 225728             | 225728             | 227986             |
| react/artifact/1 × 2 activatedJsBytes        | 229470             | 229470             | 231765             |
| react/artifact/1 × 2 initialJsGzipBytes      | 70218              | 70222              | 70925              |
| react/artifact/1 × 2 activatedJsGzipBytes    | 71824              | 71829              | 72548              |
| react/artifact/5 × 2 htmlBytes               | 10950              | 10950              | 11060              |
| react/artifact/5 × 2 htmlGzipBytes           | 1442               | 1450               | 1465               |
| react/artifact/5 × 2 cssBytes                | 2478               | 2478               | 2503               |
| react/artifact/5 × 2 propsBytes              | 11382              | 11382              | 11496              |
| react/artifact/5 × 2 initialJsBytes          | 230444             | 230444             | 232749             |
| react/artifact/5 × 2 activatedJsBytes        | 234186             | 234186             | 236528             |
| react/artifact/5 × 2 initialJsGzipBytes      | 70437              | 70451              | 71156              |
| react/artifact/5 × 2 activatedJsGzipBytes    | 72043              | 72057              | 72778              |
| react/artifact/100 × 2 htmlBytes             | 162000             | 162000             | 163620             |
| react/artifact/100 × 2 htmlGzipBytes         | 6875               | 6902               | 6972               |
| react/artifact/100 × 2 cssBytes              | 2478               | 2478               | 2503               |
| react/artifact/100 × 2 propsBytes            | 227602             | 227602             | 229879             |
| react/artifact/100 × 2 initialJsBytes        | 342449             | 342449             | 345874             |
| react/artifact/100 × 2 activatedJsBytes      | 346191             | 346191             | 349653             |
| react/artifact/100 × 2 initialJsGzipBytes    | 74318              | 74329              | 75073              |
| react/artifact/100 × 2 activatedJsGzipBytes  | 75925              | 75938              | 76698              |
| svelte/native/1 × 2 htmlBytes                | 4453               | 4453               | 4498               |
| svelte/native/1 × 2 htmlGzipBytes            | 1232               | 1235               | 1248               |
| svelte/native/1 × 2 cssBytes                 | 2478               | 2478               | 2503               |
| svelte/native/1 × 2 propsBytes               | 2278               | 2278               | 2301               |
| svelte/native/1 × 2 initialJsBytes           | 42507              | 42507              | 42933              |
| svelte/native/1 × 2 activatedJsBytes         | 46321              | 46321              | 46785              |
| svelte/native/1 × 2 initialJsGzipBytes       | 16181              | 16184              | 16346              |
| svelte/native/1 × 2 activatedJsGzipBytes     | 17945              | 17950              | 18130              |
| svelte/native/5 × 2 htmlBytes                | 10469              | 10469              | 10574              |
| svelte/native/5 × 2 htmlGzipBytes            | 1294               | 1295               | 1308               |
| svelte/native/5 × 2 cssBytes                 | 2478               | 2478               | 2503               |
| svelte/native/5 × 2 propsBytes               | 11382              | 11382              | 11496              |
| svelte/native/5 × 2 initialJsBytes           | 51024              | 51024              | 51535              |
| svelte/native/5 × 2 activatedJsBytes         | 54838              | 54838              | 55387              |
| svelte/native/5 × 2 initialJsGzipBytes       | 16684              | 16689              | 16856              |
| svelte/native/5 × 2 activatedJsGzipBytes     | 18449              | 18454              | 18639              |
| svelte/native/100 × 2 htmlBytes              | 153349             | 153349             | 154883             |
| svelte/native/100 × 2 htmlGzipBytes          | 2161               | 2163               | 2185               |
| svelte/native/100 × 2 cssBytes               | 2478               | 2478               | 2503               |
| svelte/native/100 × 2 propsBytes             | 227602             | 227602             | 229879             |
| svelte/native/100 × 2 initialJsBytes         | 253890             | 253890             | 256429             |
| svelte/native/100 × 2 activatedJsBytes       | 257704             | 257704             | 260282             |
| svelte/native/100 × 2 initialJsGzipBytes     | 26813              | 26820              | 27089              |
| svelte/native/100 × 2 activatedJsGzipBytes   | 28580              | 28585              | 28871              |
| svelte/artifact/1 × 2 htmlBytes              | 4590               | 4590               | 4636               |
| svelte/artifact/1 × 2 htmlGzipBytes          | 1257               | 1263               | 1276               |
| svelte/artifact/1 × 2 cssBytes               | 2478               | 2478               | 2503               |
| svelte/artifact/1 × 2 propsBytes             | 2278               | 2278               | 2301               |
| svelte/artifact/1 × 2 initialJsBytes         | 40252              | 40252              | 40655              |
| svelte/artifact/1 × 2 activatedJsBytes       | 44131              | 44131              | 44573              |
| svelte/artifact/1 × 2 initialJsGzipBytes     | 15463              | 15469              | 15624              |
| svelte/artifact/1 × 2 activatedJsGzipBytes   | 17267              | 17273              | 17446              |
| svelte/artifact/5 × 2 htmlBytes              | 10950              | 10950              | 11060              |
| svelte/artifact/5 × 2 htmlGzipBytes          | 1444               | 1448               | 1463               |
| svelte/artifact/5 × 2 cssBytes               | 2478               | 2478               | 2503               |
| svelte/artifact/5 × 2 propsBytes             | 11382              | 11382              | 11496              |
| svelte/artifact/5 × 2 initialJsBytes         | 44968              | 44968              | 45418              |
| svelte/artifact/5 × 2 activatedJsBytes       | 48847              | 48847              | 49336              |
| svelte/artifact/5 × 2 initialJsGzipBytes     | 15690              | 15695              | 15852              |
| svelte/artifact/5 × 2 activatedJsGzipBytes   | 17495              | 17499              | 17674              |
| svelte/artifact/100 × 2 htmlBytes            | 162000             | 162000             | 163620             |
| svelte/artifact/100 × 2 htmlGzipBytes        | 6881               | 6908               | 6978               |
| svelte/artifact/100 × 2 cssBytes             | 2478               | 2478               | 2503               |
| svelte/artifact/100 × 2 propsBytes           | 227602             | 227602             | 229879             |
| svelte/artifact/100 × 2 initialJsBytes       | 156973             | 156973             | 158543             |
| svelte/artifact/100 × 2 activatedJsBytes     | 160852             | 160852             | 162461             |
| svelte/artifact/100 × 2 initialJsGzipBytes   | 20074              | 20082              | 20283              |
| svelte/artifact/100 × 2 activatedJsGzipBytes | 21877              | 21886              | 22105              |

The baseline predates the final native provenance-marker correction; current smoke calibration checks that small reader change. These allowances are the accepted caps. Smoke runs cannot revise them.

Three independent runner repetitions are calibration evidence, not proof of stable tail latency. Smoke runs cannot produce this proposal. Script, heap, long tasks and CLS remain observations. CSS and props overlap HTML/JS. An accepted deterministic breach fails immediately; timing gets one clean rerun, with both results preserved. Noisy disagreement stays in the log and does not fail the job. A breach that is present in both runs fails. No cap is raised automatically.

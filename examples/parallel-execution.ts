import { executeWorkersInParallel } from "../src/graph/utils/parallelExecution.js";

const run = async () => {
  const workers = [
    { name: "A", invoke: async () => "Result A" },
    { name: "B", invoke: async () => "Result B" }
  ];
  const results = await executeWorkersInParallel(workers, 2);
  console.log(results);
};
run();

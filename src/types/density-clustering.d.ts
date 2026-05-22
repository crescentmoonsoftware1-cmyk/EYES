declare module 'density-clustering' {
  export class DBSCAN {
    run(dataset: number[][], epsilon: number, minPts: number): number[][];
  }
  export class KMEANS {
    run(dataset: number[][], k: number): number[][];
  }
  export class OPTICS {
    run(dataset: number[][], epsilon: number, minPts: number): number[][];
  }
}

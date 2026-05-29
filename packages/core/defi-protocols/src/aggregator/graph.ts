import { Asset } from '../types/defi-types.js';

/**
 * Serializes an Asset to a string key for graph storage.
 */
export function assetToKey(asset: Asset): string {
  if (asset.type === 'native') {
    return 'native';
  }
  return `${asset.code}:${asset.issuer}`;
}

export class LiquidityGraph {
  // Adjacency list representation: Map<AssetKey, Asset[]>
  private adjacencyList: Map<string, Asset[]>;
  private assetsByKey: Map<string, Asset>;

  constructor() {
    this.adjacencyList = new Map();
    this.assetsByKey = new Map();
  }

  /**
   * Registers a direct connection between two assets in both directions.
   */
  public addConnection(assetA: Asset, assetB: Asset): void {
    const keyA = assetToKey(assetA);
    const keyB = assetToKey(assetB);

    this.assetsByKey.set(keyA, assetA);
    this.assetsByKey.set(keyB, assetB);

    if (!this.adjacencyList.has(keyA)) {
      this.adjacencyList.set(keyA, []);
    }
    if (!this.adjacencyList.has(keyB)) {
      this.adjacencyList.set(keyB, []);
    }

    // Avoid duplicates
    if (!this.adjacencyList.get(keyA)!.find(a => assetToKey(a) === keyB)) {
      this.adjacencyList.get(keyA)!.push(assetB);
    }
    if (!this.adjacencyList.get(keyB)!.find(a => assetToKey(a) === keyA)) {
      this.adjacencyList.get(keyB)!.push(assetA);
    }
  }

  /**
   * Finds all possible paths from source to destination up to maxHops.
   * Uses Depth-First Search (DFS).
   * 
   * @param source The starting asset
   * @param destination The target asset
   * @param maxHops Maximum number of edges in a path. A 3-hop path has 4 assets.
   * @returns Array of paths, where each path is an array of Assets starting with source and ending with destination.
   */
  public findAllPaths(source: Asset, destination: Asset, maxHops: number = 3): Asset[][] {
    const sourceKey = assetToKey(source);
    const destKey = assetToKey(destination);
    const paths: Asset[][] = [];
    const visited = new Set<string>();

    const dfs = (currentAsset: Asset, currentPath: Asset[], depth: number) => {
      const currentKey = assetToKey(currentAsset);
      
      if (currentKey === destKey) {
        paths.push([...currentPath]);
        return;
      }

      if (depth >= maxHops) {
        return;
      }

      visited.add(currentKey);

      const neighbors = this.adjacencyList.get(currentKey) || [];
      for (const neighbor of neighbors) {
        const neighborKey = assetToKey(neighbor);
        if (!visited.has(neighborKey)) {
          currentPath.push(neighbor);
          dfs(neighbor, currentPath, depth + 1);
          currentPath.pop();
        }
      }

      visited.delete(currentKey);
    };

    // Ensure the source and destination are registered, even if they don't have existing connections
    if (!this.assetsByKey.has(sourceKey)) {
        this.assetsByKey.set(sourceKey, source);
    }
    if (!this.assetsByKey.has(destKey)) {
        this.assetsByKey.set(destKey, destination);
    }

    dfs(source, [source], 0);

    return paths;
  }
}

export class DBService {
  static dbName = 'ImageProcessorDB';
  static storeName = 'usedIndices';
  
  static async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onerror = () => reject(request.error);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'index' });
        }
      };
      
      request.onsuccess = () => resolve(request.result);
    });
  }

  static async getNextAvailableIndex() {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const usedIndices = request.result.map(item => item.index);
        let nextIndex = 1;
        
        while (usedIndices.includes(nextIndex)) {
          nextIndex++;
        }
        resolve(nextIndex);
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  static async markIndexAsUsed(index) {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.add({ index });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
} 
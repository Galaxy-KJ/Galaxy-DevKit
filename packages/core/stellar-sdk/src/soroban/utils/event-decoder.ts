/**
 * @fileoverview Event Decoder
 * @description Decode Soroban contract events
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { xdr } from '@stellar/stellar-sdk';
import { ScValConverter } from './scval-converter';
import { ContractEvent, ScType } from '../types/contract-types';
import { ContractEventDetail } from '../types/contract-types';

export class EventDecoder {
  /**
   * Decode contract event from raw event data
   */
  static decodeEvent(
    rawEvent: SorobanRpc.Api.GetEventsResponseEvent,
    eventDefinition?: ContractEvent
  ): ContractEventDetail {
    const decodedTopics =
      rawEvent.topics?.map(topic => ScValConverter.fromScVal(topic)) || [];
    const decodedData = rawEvent.data
      ? ScValConverter.fromScVal(rawEvent.data)
      : null;

    return {
      contractId: rawEvent.contractId?.toString() || '',
      type: rawEvent.type.toString(),
      topics: rawEvent.topics || [],
      data: rawEvent.data || xdr.ScVal.scvVoid(),
      timestamp: rawEvent.timestamp || 0,
      ledger: rawEvent.ledger || 0,
      txHash: rawEvent.txHash || '',
      // Additional decoded information
      decodedTopics,
      decodedData,
      eventName: eventDefinition?.name || 'unknown',
    };
  }

  /**
   * Decode event with known event schema
   */
  static decodeEventWithSchema(
    rawEvent: SorobanRpc.Api.GetEventsResponseEvent,
    schema: {
      name: string;
      topicTypes: ScType[];
      dataTypes: ScType[];
    }
  ): ContractEventDetail & {
    decodedTopics: any[];
    decodedData: any;
    parsedEvent: any;
  } {
    // Decode topics
    const decodedTopics =
      rawEvent.topics?.map((topic, index) => {
        const type = schema.topicTypes[index];
        return ScValConverter.fromTypedScVal(topic, type);
      }) || [];

    // Decode data (handle both single value and tuple)
    let decodedData: any;
    if (rawEvent.data) {
      if (schema.dataTypes.length === 1) {
        decodedData = ScValConverter.fromTypedScVal(
          rawEvent.data,
          schema.dataTypes[0]
        );
      } else {
        // Assume data is a vector/tuple
        const dataVec = ScValConverter.fromScVal(rawEvent.data);
        if (Array.isArray(dataVec)) {
          decodedData = dataVec.map((item, index) =>
            ScValConverter.fromTypedScVal(item, schema.dataTypes[index])
          );
        } else {
          decodedData = dataVec;
        }
      }
    }

    // Create parsed event object
    const parsedEvent: any = {
      name: schema.name,
      topics: {},
      data: {},
    };

    // Map topics to named fields if possible
    if (schema.topicTypes.length >= 1) {
      // First topic is usually the event identifier
      parsedEvent.eventType = decodedTopics[0];
    }
    for (let i = 0; i < decodedTopics.length; i++) {
      parsedEvent.topics[`topic${i}`] = decodedTopics[i];
    }

    // Map data to named fields
    if (schema.dataTypes.length === 1) {
      parsedEvent.data = decodedData;
    } else {
      for (let i = 0; i < schema.dataTypes.length; i++) {
        parsedEvent.data[`field${i}`] = decodedData[i];
      }
    }

    return {
      contractId: rawEvent.contractId?.toString() || '',
      type: rawEvent.type.toString(),
      topics: rawEvent.topics || [],
      data: rawEvent.data || xdr.ScVal.scvVoid(),
      timestamp: rawEvent.timestamp || 0,
      ledger: rawEvent.ledger || 0,
      txHash: rawEvent.txHash || '',
      decodedTopics,
      decodedData,
      parsedEvent,
      eventName: schema.name,
    };
  }

  /**
   * Decode token transfer event
   */
  static decodeTransferEvent(event: ContractEventDetail): {
    from: string;
    to: string;
    amount: string;
  } | null {
    try {
      // Standard token transfer event has topics: ["transfer", from, to, amount]
      if (event.decodedTopics.length >= 4) {
        return {
          from: event.decodedTopics[1],
          to: event.decodedTopics[2],
          amount: event.decodedTopics[3]?.toString() || '0',
        };
      }

      // Alternative format: event type in topic[0], data contains transfer info
      if (event.decodedTopics[0] === 'transfer' && event.decodedData) {
        const data =
          typeof event.decodedData === 'object' ? event.decodedData : {};
        return {
          from: data.from || '',
          to: data.to || '',
          amount: data.amount?.toString() || '0',
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to decode transfer event:', error);
      return null;
    }
  }

  /**
   * Decode token approval event
   */
  static decodeApprovalEvent(event: ContractEventDetail): {
    owner: string;
    spender: string;
    amount: string;
  } | null {
    try {
      // Standard token approval event has topics: ["approve", owner, spender, amount]
      if (event.decodedTopics.length >= 4) {
        return {
          owner: event.decodedTopics[1],
          spender: event.decodedTopics[2],
          amount: event.decodedTopics[3]?.toString() || '0',
        };
      }

      // Alternative format
      if (event.decodedTopics[0] === 'approve' && event.decodedData) {
        const data =
          typeof event.decodedData === 'object' ? event.decodedData : {};
        return {
          owner: data.owner || '',
          spender: data.spender || '',
          amount: data.amount?.toString() || '0',
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to decode approval event:', error);
      return null;
    }
  }

  /**
   * Decode contract error event
   */
  static decodeErrorEvent(event: ContractEventDetail): {
    error: string;
    code?: number;
    context?: any;
  } | null {
    try {
      if (event.decodedTopics[0] === 'error') {
        const errorInfo = event.decodedData;

        if (typeof errorInfo === 'string') {
          return { error: errorInfo };
        }

        if (typeof errorInfo === 'object' && errorInfo !== null) {
          return {
            error: errorInfo.message || errorInfo.error || 'Unknown error',
            code: errorInfo.code,
            context: errorInfo.context,
          };
        }
      }

      return null;
    } catch (error) {
      console.error('Failed to decode error event:', error);
      return null;
    }
  }

  /**
   * Decode custom event
   */
  static decodeCustomEvent(
    event: ContractEventDetail,
    fieldMapping: Record<
      string,
      { topic: number; type: ScType } | { data: string; type: ScType }
    >
  ): Record<string, any> {
    const decoded: Record<string, any> = {};

    for (const [fieldName, mapping] of Object.entries(fieldMapping)) {
      if ('topic' in mapping) {
        // Extract from topic
        const topicIndex = mapping.topic;
        if (topicIndex < event.decodedTopics.length) {
          decoded[fieldName] = ScValConverter.fromTypedScVal(
            event.topics[topicIndex],
            mapping.type
          );
        }
      } else {
        // Extract from data
        if (event.decodedData && typeof event.decodedData === 'object') {
          decoded[fieldName] = ScValConverter.fromTypedScVal(
            ScValConverter.toScVal(event.decodedData[mapping.data]),
            mapping.type
          );
        }
      }
    }

    return decoded;
  }

  /**
   * Create event decoder for specific contract
   */
  static createEventDecoder(
    eventSchemas: Array<{
      name: string;
      topicTypes: ScType[];
      dataTypes: ScType[];
    }>
  ): (event: ContractEventDetail) => any {
    return (event: ContractEventDetail) => {
      // Try to find matching schema
      const schema = eventSchemas.find(
        s => event.decodedTopics[0] === s.name || event.eventName === s.name
      );

      if (schema) {
        return this.decodeEventWithSchema(event, schema);
      }

      // Fallback to basic decoding
      return this.decodeEvent(event);
    };
  }

  /**
   * Filter events by type
   */
  static filterEventsByType(
    events: ContractEventDetail[],
    eventType: string
  ): ContractEventDetail[] {
    return events.filter(
      event =>
        event.decodedTopics[0] === eventType || event.eventName === eventType
    );
  }

  /**
   * Group events by transaction
   */
  static groupEventsByTransaction(
    events: ContractEventDetail[]
  ): Map<string, ContractEventDetail[]> {
    const grouped = new Map<string, ContractEventDetail[]>();

    for (const event of events) {
      const txHash = event.txHash;
      if (!grouped.has(txHash)) {
        grouped.set(txHash, []);
      }
      grouped.get(txHash)!.push(event);
    }

    return grouped;
  }

  /**
   * Extract event statistics
   */
  static extractEventStats(events: ContractEventDetail[]): {
    totalEvents: number;
    eventTypes: Map<string, number>;
    contracts: Map<string, number>;
    timeRange: { min: number; max: number };
  } {
    const eventTypes = new Map<string, number>();
    const contracts = new Map<string, number>();
    const timestamps = events.map(e => e.timestamp).filter(t => t > 0);

    for (const event of events) {
      // Count event types
      const eventType = event.decodedTopics[0] || event.eventName || 'unknown';
      eventTypes.set(eventType, (eventTypes.get(eventType) || 0) + 1);

      // Count contracts
      contracts.set(
        event.contractId,
        (contracts.get(event.contractId) || 0) + 1
      );
    }

    return {
      totalEvents: events.length,
      eventTypes,
      contracts,
      timeRange: {
        min: timestamps.length > 0 ? Math.min(...timestamps) : 0,
        max: timestamps.length > 0 ? Math.max(...timestamps) : 0,
      },
    };
  }

  /**
   * Format event for display
   */
  static formatEvent(event: ContractEventDetail): string {
    const timestamp = new Date(event.timestamp).toISOString();
    const eventType = event.decodedTopics[0] || event.eventName || 'unknown';

    let formatted = `[${timestamp}] ${eventType} (${event.contractId})`;

    if (event.decodedTopics.length > 1) {
      const topics = event.decodedTopics
        .slice(1)
        .map(t => (typeof t === 'string' ? t : JSON.stringify(t)))
        .join(', ');
      formatted += ` Topics: [${topics}]`;
    }

    if (event.decodedData !== null && event.decodedData !== undefined) {
      const dataStr =
        typeof event.decodedData === 'string'
          ? event.decodedData
          : JSON.stringify(event.decodedData);
      formatted += ` Data: ${dataStr}`;
    }

    return formatted;
  }

  /**
   * Export events to CSV
   */
  static exportToCSV(events: ContractEventDetail[]): string {
    const headers = [
      'timestamp',
      'ledger',
      'txHash',
      'contractId',
      'eventType',
      'topics',
      'data',
    ];

    const rows = events.map(event => [
      new Date(event.timestamp).toISOString(),
      event.ledger.toString(),
      event.txHash,
      event.contractId,
      event.decodedTopics[0] || event.eventName || '',
      JSON.stringify(event.decodedTopics),
      JSON.stringify(event.decodedData),
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }
}

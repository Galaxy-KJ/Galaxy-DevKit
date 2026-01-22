/**
 * @fileoverview Contract events example
 * @description Example of monitoring Soroban contract events
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import {
  ContractEventMonitor,
  EventDecoder,
  SorobanContractManager,
} from '@galaxy/core-stellar-sdk';
import { Keypair } from '@stellar/stellar-sdk';

async function contractEventsExample() {
  console.log('📡 Contract Events Monitoring Example');
  console.log('===================================');

  // Configuration
  const contractId = 'YOUR_CONTRACT_ID_HERE'; // Replace with actual contract ID
  const networkPassphrase = 'Test SDF Network ; September 2015';
  const manager = new SorobanContractManager(
    'https://soroban-testnet.stellar.org'
  );
  const eventMonitor = new ContractEventMonitor(
    'https://soroban-testnet.stellar.org'
  );

  // Create keypair for operations
  const keypair = Keypair.random();
  console.log(`🔐 KeyPair Public Key: ${keypair.publicKey()}`);
  console.log('⚠️  Fund this account with testnet lumens before proceeding');

  try {
    // Example 1: Query historical events
    console.log('\n📚 Example 1: Querying Historical Events');
    console.log('-----------------------------------------');

    const historicalEvents = await eventMonitor.queryEvents({
      contractId,
      startLedger: 500000, // Adjust as needed
      endLedger: 500100, // Adjust as needed
      eventTypes: ['transfer', 'approval', 'mint', 'burn'],
      networkPassphrase,
    });

    console.log(`📊 Found ${historicalEvents.length} events`);

    // Process and display events
    for (const event of historicalEvents) {
      const decoded = EventDecoder.decodeEvent(event);
      console.log(`📝 Event: ${decoded.eventName}`);
      console.log(`   Type: ${decoded.type}`);
      console.log(`   Topics: ${decoded.decodedTopics.join(', ')}`);
      console.log(`   Data: ${JSON.stringify(decoded.decodedData)}`);
      console.log(`   Timestamp: ${new Date(decoded.timestamp).toISOString()}`);
      console.log(`   Ledger: ${decoded.ledger}`);
      console.log(`   Tx Hash: ${decoded.txHash}`);
      console.log('');
    }

    // Example 2: Real-time event monitoring
    console.log('📡 Example 2: Real-time Event Monitoring');
    console.log('------------------------------------------');

    let eventCount = 0;
    const subscriptionId = await eventMonitor.subscribeToEvents({
      contractId,
      eventTypes: ['transfer', 'approval'],
      onEvent: event => {
        eventCount++;
        console.log(`🔔 New Event #${eventCount}:`);
        console.log(`   Type: ${event.type}`);
        console.log(`   Topics: ${event.decodedTopics.join(', ')}`);
        console.log(`   Timestamp: ${new Date(event.timestamp).toISOString()}`);
        console.log(`   Ledger: ${event.ledger}`);
        console.log(''); // Empty line for readability
      },
      onError: error => {
        console.error('❌ Event monitoring error:', error.message);
      },
      onClose: () => {
        console.log('🔌 Event monitoring closed');
      },
    });

    console.log(`✅ Subscribed to events with ID: ${subscriptionId}`);

    // Generate some events by invoking contract methods
    console.log('\n🎯 Generating events by invoking contract methods...');

    // Simulate some contract invocations that would generate events
    const operations = [
      {
        method: 'transfer',
        args: [
          keypair.publicKey(),
          'GDQZ43L2QQ3B5OUP4QKA52L2AKYYG5ZC5LEJ2TFKX2LFDWLXRWERFW53',
          '1000000',
        ],
      },
      {
        method: 'approve',
        args: [
          keypair.publicKey(),
          'GBBQ7O3YHQ6WBMKY5R6BTR3L3BAK336GUWHN7JDIQRFVA2KE7A2WD3QY',
          '500000',
        ],
      },
      {
        method: 'mint',
        args: [
          'GDQZ43L2QQ3B5OUP4QKA52L2AKYYG5ZC5LEJ2TFKX2LFDWLXRWERFW53',
          '2000000',
        ],
      },
    ];

    for (const op of operations) {
      try {
        // Simulate first
        const simulation = await manager.simulateInvocation({
          contractId,
          method: op.method,
          args: op.args,
          networkPassphrase,
        });

        if (!simulation.error) {
          console.log(`🔍 Simulating ${op.method}...`);
          // In a real scenario, you would execute the transaction:
          // const result = await manager.invokeContract({
          //   contractId,
          //   method: op.method,
          //   args: op.args,
          //   caller: keypair,
          //   networkPassphrase
          // });
          console.log(`✅ ${op.method} would generate events`);
        } else {
          console.log(`❌ ${op.method} simulation failed: ${simulation.error}`);
        }
      } catch (error) {
        console.log(`❌ ${op.method} failed: ${error.message}`);
      }

      // Wait a bit between operations
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Wait for event processing
    console.log('\n⏳ Waiting for event processing...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Example 3: Event filtering and analysis
    console.log('\n🔍 Example 3: Event Filtering and Analysis');
    console.log('-------------------------------------------');

    // Get more events for analysis
    const analysisEvents = await eventMonitor.queryEvents({
      contractId,
      startLedger: 500000,
      endLedger: 500200,
      networkPassphrase,
    });

    // Filter events by type
    const transferEvents = eventMonitor.filterEventsByTopic(
      analysisEvents,
      'transfer'
    );
    const approvalEvents = eventMonitor.filterEventsByTopic(
      analysisEvents,
      'approval'
    );

    console.log(`📊 Event Analysis:`);
    console.log(`   Total Events: ${analysisEvents.length}`);
    console.log(`   Transfer Events: ${transferEvents.length}`);
    console.log(`   Approval Events: ${approvalEvents.length}`);

    // Get event statistics
    const stats = eventMonitor.getEventStats(analysisEvents);
    console.log(`   Unique Contracts: ${stats.uniqueContracts}`);
    console.log(`   Unique Event Types: ${stats.uniqueTypes}`);
    console.log(
      `   Ledger Range: ${stats.ledgerRange.min} - ${stats.ledgerRange.max}`
    );
    console.log(
      `   Time Range: ${new Date(stats.timeRange.min).toISOString()} - ${new Date(stats.timeRange.max).toISOString()}`
    );

    // Example 4: Custom event decoding
    console.log('\n🏷️ Example 4: Custom Event Decoding');
    console.log('------------------------------------');

    // Define event schema for custom decoding
    const eventSchemas = [
      {
        name: 'transfer',
        topicTypes: ['symbol', 'address', 'address', 'u64'],
        dataTypes: [],
      },
      {
        name: 'approval',
        topicTypes: ['symbol', 'address', 'address', 'u64'],
        dataTypes: [],
      },
    ];

    // Create custom decoder
    const customDecoder = EventDecoder.createEventDecoder(eventSchemas);

    // Decode events with schema
    for (const event of analysisEvents.slice(0, 3)) {
      const decoded = customDecoder(event);
      console.log(`🔍 Custom Decoded Event:`);
      console.log(`   Name: ${decoded.eventName}`);
      console.log(`   Parsed: ${JSON.stringify(decoded.parsedEvent)}`);

      // Try to decode specific event types
      if (decoded.eventName === 'transfer') {
        const transfer = EventDecoder.decodeTransferEvent(decoded);
        if (transfer) {
          console.log(`   Transfer Details:`);
          console.log(`     From: ${transfer.from}`);
          console.log(`     To: ${transfer.to}`);
          console.log(`     Amount: ${transfer.amount}`);
        }
      }

      if (decoded.eventName === 'approval') {
        const approval = EventDecoder.decodeApprovalEvent(decoded);
        if (approval) {
          console.log(`   Approval Details:`);
          console.log(`     Owner: ${approval.owner}`);
          console.log(`     Spender: ${approval.spender}`);
          console.log(`     Amount: ${approval.amount}`);
        }
      }
      console.log('');
    }

    // Example 5: Event export
    console.log('📤 Example 5: Event Export');
    console.log('---------------------------');

    const csvData = EventDecoder.exportToCSV(analysisEvents);
    console.log(`📄 Generated CSV with ${analysisEvents.length} events`);
    console.log(`📏 CSV Size: ${csvData.length} characters`);

    // You could save this to a file:
    // fs.writeFileSync('events.csv', csvData);

    // Example 6: Multiple contract monitoring
    console.log('\n📡 Example 6: Multiple Contract Monitoring');
    console.log('---------------------------------------------');

    const contracts = [
      { id: contractId, name: 'Main Contract' },
      { id: 'ANOTHER_CONTRACT_ID', name: 'Token Contract' },
    ];

    const subscriptions = [];

    for (const contract of contracts) {
      try {
        const subId = await eventMonitor.subscribeToEvents({
          contractId: contract.id,
          onEvent: event => {
            console.log(
              `🔔 ${contract.name} Event: ${event.eventName || event.decodedTopics[0]}`
            );
          },
          onError: error => {
            console.error(`❌ ${contract.name} Error:`, error.message);
          },
        });

        subscriptions.push({ id: subId, contract: contract.name });
        console.log(`✅ Subscribed to ${contract.name} events`);
      } catch (error) {
        console.error(
          `❌ Failed to subscribe to ${contract.name}:`,
          error.message
        );
      }
    }

    // Cleanup
    console.log('\n🧹 Cleaning up subscriptions...');
    subscriptions.forEach(sub => {
      eventMonitor.unsubscribe(sub.id);
      console.log(`✅ Unsubscribed from ${sub.contract}`);
    });

    console.log('\n🎉 Contract events example completed!');
  } catch (error) {
    console.error('❌ Contract events example failed:', error.message);

    if (error.message.includes('contract not found')) {
      console.log('💡 Tip: Verify the contract ID is correct and deployed');
    }

    if (error.message.includes('events not found')) {
      console.log(
        '💡 Tip: Try adjusting the ledger range or check if the contract has emitted events'
      );
    }
  }
}

// Helper function to get recent events for analysis
async function getRecentEventsForContract(
  monitor: ContractEventMonitor,
  contractId: string,
  lastLedgers: number = 1000
): Promise<any[]> {
  try {
    // Get latest ledger first
    const currentLedger = await monitor.getServer().getLatestLedger();
    const startLedger = Math.max(0, currentLedger.sequence - lastLedgers);

    return await monitor.queryEvents({
      contractId,
      startLedger,
      networkPassphrase: 'Test SDF Network ; September 2015',
    });
  } catch (error) {
    console.error('Failed to get recent events:', error.message);
    return [];
  }
}

// Helper function to analyze event patterns
function analyzeEventPatterns(events: any[]): {
  mostActiveTopics: Array<{ topic: string; count: number }>;
  eventFrequency: Array<{ hour: number; count: number }>;
  averageEventsPerLedger: number;
} {
  const topicCounts = new Map<string, number>();
  const hourCounts = new Map<number, number>();
  let totalEvents = 0;
  let uniqueLedgers = new Set<number>();

  for (const event of events) {
    // Count topics
    const topic = event.decodedTopics[0] || 'unknown';
    topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);

    // Count by hour
    const hour = new Date(event.timestamp).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);

    // Track ledgers
    uniqueLedgers.add(event.ledger);
    totalEvents++;
  }

  const mostActiveTopics = Array.from(topicCounts.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const eventFrequency = Array.from(hourCounts.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour - b.hour);

  const averageEventsPerLedger =
    uniqueLedgers.size > 0 ? totalEvents / uniqueLedgers.size : 0;

  return {
    mostActiveTopics,
    eventFrequency,
    averageEventsPerLedger,
  };
}

// Run example
if (require.main === module) {
  contractEventsExample()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Example failed:', error);
      process.exit(1);
    });
}

export {
  contractEventsExample,
  getRecentEventsForContract,
  analyzeEventPatterns,
};

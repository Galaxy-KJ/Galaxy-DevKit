/**
 * Automation GraphQL Resolvers
 * Handles automation-related queries, mutations, and subscriptions
 */

interface CreateAutomationInput {
  name: string;
  description?: string;
  trigger: any;
  actions: any[];
  enabled?: boolean;
}

interface UpdateAutomationInput {
  id: string;
  name?: string;
  description?: string;
  trigger?: any;
  actions?: any[];
  enabled?: boolean;
}

export const automationResolvers = {
  Query: {
    automation: async (_: any, { id }: { id: string }, context: any) => {
      try {
        const automation = await context.dataSources.automationService.getAutomation(id);
        return automation;
      } catch (error) {
        throw new Error(`Failed to fetch automation: ${(error as Error).message}`);
      }
    },

    automations: async (
      _: any,
      { first, after, status }: { first?: number; after?: string; status?: string },
      context: any
    ) => {
      try {
        const automations = await context.dataSources.automationService.getAutomations({
          first: first || 10,
          after,
          status,
        });
        return automations;
      } catch (error) {
        throw new Error(`Failed to fetch automations: ${(error as Error).message}`);
      }
    },

    automationExecutionHistory: async (
      _: any,
      { id, first }: { id: string; first?: number },
      context: any
    ) => {
      try {
        const history = await context.dataSources.automationService.getExecutionHistory(
          id,
          first || 20
        );
        return history;
      } catch (error) {
        throw new Error(
          `Failed to fetch automation execution history: ${(error as Error).message}`
        );
      }
    },
  },

  Mutation: {
    createAutomation: async (
      _: any,
      { name, description, trigger, actions, enabled }: CreateAutomationInput,
      context: any
    ) => {
      try {
        const automation = await context.dataSources.automationService.createAutomation({
          name,
          description,
          trigger,
          actions,
          enabled: enabled !== false,
        });
        // Emit ID-scoped events so subscribers listening to `automation:<id>:*` receive updates
        if (automation && automation.id) {
          context.subscriptionManager.emit(`automation:${automation.id}:created`, automation);
          context.subscriptionManager.emit(`automation:${automation.id}:status-changed`, automation);
        } else {
          context.subscriptionManager.emit('automationCreated', automation);
        }
        return automation;
      } catch (error) {
        throw new Error(`Failed to create automation: ${(error as Error).message}`);
      }
    },

    updateAutomation: async (
      _: any,
      { id, name, description, trigger, actions, enabled }: UpdateAutomationInput,
      context: any
    ) => {
      try {
        const automation = await context.dataSources.automationService.updateAutomation(
          id,
          {
            name,
            description,
            trigger,
            actions,
            enabled,
          }
        );
        if (automation && automation.id) {
          context.subscriptionManager.emit(`automation:${automation.id}:updated`, automation);
          context.subscriptionManager.emit(`automation:${automation.id}:status-changed`, automation);
        } else {
          context.subscriptionManager.emit('automationUpdated', automation);
        }
        return automation;
      } catch (error) {
        throw new Error(`Failed to update automation: ${(error as Error).message}`);
      }
    },

    executeAutomation: async (_: any, { id }: { id: string }, context: any) => {
      try {
        const result = await context.dataSources.automationService.executeAutomation(id);
        // Emit both executed and triggered channels for consumers
        context.subscriptionManager.emit(`automation:${id}:executed`, { id, result });
        context.subscriptionManager.emit(`automation:${id}:triggered`, { id, result });
        return result;
      } catch (error) {
        throw new Error(`Failed to execute automation: ${(error as Error).message}`);
      }
    },

    deleteAutomation: async (_: any, { id }: { id: string }, context: any) => {
      try {
        await context.dataSources.automationService.deleteAutomation(id);
        // Emit ID-scoped deletion event
        context.subscriptionManager.emit(`automation:${id}:deleted`, { id });
        return true;
      } catch (error) {
        throw new Error(`Failed to delete automation: ${(error as Error).message}`);
      }
    },

    pauseAutomation: async (_: any, { id }: { id: string }, context: any) => {
      try {
        const automation = await context.dataSources.automationService.pauseAutomation(id);
        if (automation && automation.id) {
          context.subscriptionManager.emit(`automation:${automation.id}:status-changed`, automation);
          context.subscriptionManager.emit(`automation:${automation.id}:stopped`, automation);
        } else {
          context.subscriptionManager.emit('automationPaused', automation);
        }
        return automation;
      } catch (error) {
        throw new Error(`Failed to pause automation: ${(error as Error).message}`);
      }
    },

    resumeAutomation: async (_: any, { id }: { id: string }, context: any) => {
      try {
        const automation = await context.dataSources.automationService.resumeAutomation(id);
        if (automation && automation.id) {
          context.subscriptionManager.emit(`automation:${automation.id}:status-changed`, automation);
          context.subscriptionManager.emit(`automation:${automation.id}:started`, automation);
        } else {
          context.subscriptionManager.emit('automationResumed', automation);
        }
        return automation;
      } catch (error) {
        throw new Error(`Failed to resume automation: ${(error as Error).message}`);
      }
    },
  },

  Subscription: {
    automationExecuted: {
      subscribe: (_: any, { automationId }: { automationId: string }, context: any) => {
        return context.subscriptionManager.subscribe(`automation:${automationId}:executed`);
      },
      resolve: (payload: any) => payload,
    },

    automationTriggered: {
      subscribe: (_: any, { automationId }: { automationId: string }, context: any) => {
        return context.subscriptionManager.subscribe(`automation:${automationId}:triggered`);
      },
      resolve: (payload: any) => payload,
    },

    automationStatusChanged: {
      subscribe: (_: any, { automationId }: { automationId: string }, context: any) => {
        return context.subscriptionManager.subscribe(
          `automation:${automationId}:status-changed`
        );
      },
      resolve: (payload: any) => payload,
    },
  },

  Automation: {
    actions: (automation: any) => {
      return automation.actions || [];
    },
  },
};

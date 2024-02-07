'use strict';

/* eslint-disable @typescript-eslint/no-misused-promises */

import Homey from 'homey';
import cron, { ScheduledTask } from 'node-cron';

type CronParts = {
  second?: string;
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

const expressionFromParts = (parts: CronParts): string => {
  return `${parts.second ? `${parts.second} ` : ''} ${parts.minute} ${parts.hour} ${parts.dayOfMonth} ${parts.month} ${parts.dayOfWeek}`;
};

class CronJobApp extends Homey.App {

  cronExpressionSchedule?: Homey.FlowCardTrigger;
  cronPartsSchedule?: Homey.FlowCardTrigger;
  tasks: ScheduledTask[] = [];

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.cronExpressionSchedule = this.homey.flow.getTriggerCard('cron_expression_schedule');
    this.cronPartsSchedule = this.homey.flow.getTriggerCard('cron_parts_schedule');

    this.cronExpressionSchedule.registerRunListener(async (args, state) => {
      return args.schedule === state.schedule;
    });

    this.cronPartsSchedule.registerRunListener(async (args, state) => {
      return expressionFromParts(args) === state.schedule;
    });

    await this.handleUpdate();

    this.cronExpressionSchedule.on('update', this.handleUpdate.bind(this));
    this.cronPartsSchedule.on('update', this.handleUpdate.bind(this));
  }

  async handleUpdate() {
    const newTasks: ScheduledTask[] = [];
    const schedules = new Set([
      ...(await this.cronExpressionSchedule?.getArgumentValues() ?? []).map((c) => c.schedule),
      ...(await this.cronPartsSchedule?.getArgumentValues() ?? []).map(expressionFromParts),
    ]);

    schedules.forEach((schedule) => {
      try {
        const task = cron.schedule(
          schedule,
          async () => {
            await this.cronExpressionSchedule?.trigger(undefined, { schedule });
            await this.cronPartsSchedule?.trigger(undefined, { schedule });
          },
          {
            timezone: this.homey.clock.getTimezone(),
          },
        );

        newTasks.push(task);
      } catch (e) {
        this.error(e, schedule);
      }
    });

    this.tasks.forEach((t) => t.stop());
    this.tasks = newTasks;
  }

}

module.exports = CronJobApp;

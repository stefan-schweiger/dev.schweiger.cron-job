'use strict';

/* eslint-disable @typescript-eslint/no-misused-promises */

import Homey from 'homey';
import { CronJob } from 'cron';

type CronParts = {
  second?: string;
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

const expressionFromParts = (parts: CronParts): string => {
  return `${parts.second ? parts.second : ''} ${parts.minute} ${parts.hour} ${parts.dayOfMonth} ${parts.month} ${parts.dayOfWeek}`.trim();
};

class CronJobApp extends Homey.App {

  cronExpressionSchedule?: Homey.FlowCardTrigger;
  cronPartsSchedule?: Homey.FlowCardTrigger;
  jobs: Record<string, CronJob> = { };

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

    this.homey.clock.on('timezoneChange', async () => {
      Object.keys(this.jobs)
        .forEach((key) => {
          this.jobs[key].stop();
          delete this.jobs[key];
          this.log(`Stopped schedule ${key}`);
        });

      await this.handleUpdate();
    });
  }

  async handleUpdate() {
    // use set to only handle unique schedules
    const schedules = [...new Set([
      ...(await this.cronExpressionSchedule?.getArgumentValues() ?? []).map((c) => c.schedule),
      ...(await this.cronPartsSchedule?.getArgumentValues() ?? []).map(expressionFromParts),
    ])];

    Object.keys(this.jobs)
      .forEach((key) => {
        // stop and remove all jobs which are not used in flows anymore
        if (!schedules.includes(key)) {
          this.jobs[key].stop();
          delete this.jobs[key];
          this.log(`Stopped schedule ${key}`);
        }
      });

    schedules.forEach((schedule) => {
      // ignore already scheduled jobs
      if (this.jobs[schedule]) {
        return;
      }

      try {
        this.jobs[schedule] = CronJob.from({
          cronTime: schedule,
          onTick: async () => {
            this.log(`Triggered schedule ${schedule}`);
            // trigger both, this will be filtered by the RunListener
            await this.cronExpressionSchedule?.trigger(undefined, { schedule });
            await this.cronPartsSchedule?.trigger(undefined, { schedule });
          },
          start: true,
          timeZone: this.homey.clock.getTimezone(),
        });

        this.log(`Started schedule ${schedule}`);
      } catch (e) {
        this.error(e, schedule);
      }
    });
  }

}

module.exports = CronJobApp;

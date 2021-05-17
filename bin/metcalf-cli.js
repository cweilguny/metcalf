#!/usr/bin/env node

const process = require('process');
const fs = require('fs');
const {spawn} = require("child_process");
const path = require('path');


class Utils {
    static exitWithError(message, wasProcessingStarted, isConfigError) {
        if (isConfigError) {
            message += ' Please check the Metcalf.json file.';
        }
        if (!wasProcessingStarted) {
            message += ' Nothing was metcalfed.';
        }
        console.error('[ERROR] ' + message);
        process.exit(1);
    }

    static getCliArgSplitBy(argName, splitBy, defaultValue) {
        let arg = Utils.getCliArg(argName);
        if (!arg) {
            return defaultValue;
        } else {
            return arg.split(splitBy);
        }
    }

    static getCliArg(argName, defaultValue) {
        for (let i = 2; i < process.argv.length; i++) {
            const arg = process.argv[i];
            if (arg.startsWith(argName + '=')) {
                return arg.substr(argName.length + 1);
            }
        }
        return defaultValue;
    }

    static existsCliSwitch(argName) {
        for (let i = 2; i < process.argv.length; i++) {
            const arg = process.argv[i];
            if (arg === argName) {
                return true;
            }
        }
        return false;
    }
}

class Task {
    config;
    taskId;
    task;

    constructor(config, taskId, task) {
        this.config = config;
        this.taskId = taskId;
        this.task = task;
    }

    enqueueJobs(queue) {
        this.getSetCombinations().forEach(setCombination => this.enqueueJob(queue, setCombination));
    }

    getSetCombinations() {
        return this.cartesianProduct(this.task.run.reduce((acc, set) => this.addSetValues(acc, set), []));
    }

    cartesianProduct(arrays) {
        return arrays.reduce((acc, set) => [].concat.apply([], acc.map(x => set.map(y => [...x, y]))), [[]]);
    }

    addSetValues(current, set) {
        current.push(this.getSetValues(set));
        return current;
    }

    getSetValues(set) {
        let setValues;
        const cliSet = Utils.getCliArgSplitBy('sets.' + set, ',', null);
        if (!!this.task.sets && !!this.task.sets[set]) {
            setValues = this.task.sets[set];
        } else if (!!this.config.sets && !!this.config.sets[set]) {
            setValues = this.config.sets[set];
        } else {
            Utils.exitWithError('Set "' + set + '" not found for task ID "' + this.taskId + '".', false, true);
        }
        if (cliSet !== null && Array.isArray(cliSet)) {
            const invalidValues = cliSet.filter(value => !setValues.map(v => '' + v).includes(value));
            if (invalidValues.length > 0) {
                Utils.exitWithError(
                    'Value' + (invalidValues.length > 1 ? 's' : '') + ' "' + invalidValues.join(', ')
                    + '" for set "' + set + '" for task ID "' + this.taskId
                    + '" ' + (invalidValues.length > 1 ? 'are' : 'is')
                    + ' not configured in Metcalf.json.',
                    false,
                    true
                );
            }
            setValues = cliSet.filter(value => setValues.map(v => '' + v).includes(value));
        }
        if (!Array.isArray(setValues)) {
            Utils.exitWithError('Set "' + set + '" for task ID "' + this.taskId + '" is not an array.', false, true);
        }
        return setValues.map(value => {
            return {key: set, value: value}
        });
    }

    enqueueJob(queue, setCombination) {
        queue.push({
            task: this.taskId,
            command: this.task.hasOwnProperty('command') ? this.task.command : this.config.command,
            title: this.replaceSetValues(this.task.title, setCombination),
            createDirs: this.getCreateDirs(setCombination),
            args: this.task.commandArgs.map(commandArg => this.replaceSetValues(commandArg, setCombination))
        });
    }

    replaceSetValues(value, setCombination) {
        return setCombination.reduce((acc, keyValue) => acc.replaceAll('@' + keyValue.key + '@', keyValue.value), value);
    }

    getCreateDirs(setCombination) {
        if (this.task.hasOwnProperty('createDirs')) {
            return this.task.createDirs.map(dir => this.replaceSetValues(dir, setCombination));
        } else {
            return [];
        }
    }
}

class QueueRunner {
    config;
    queue = [];
    processCount = 0;
    runCount = 0;
    successfulBuilds = [];
    failedBuilds = [];

    constructor(config, queue) {
        this.config = config;
        this.queue = queue;
    }

    runQueue() {
        this.startTime = (new Date()).getTime();
        console.log(
            "################################################################################\n" +
            "### " + this.queue.length + " BUILDS IN QUEUE\n" +
            "################################################################################\n"
        );
        const maxWorkers = Utils.getCliArg('maxWorkers', this.config.maxWorkers) || 1;
        for (let i = 0; i < maxWorkers && i < this.queue.length; i++) {
            this.runNext();
        }
    }

    runNext() {
        if (this.queue && this.queue.length > 0 && this.runCount < this.queue.length) {
            this.processCount++;
            const queueItem = this.queue[this.runCount];
            this.runCount++;
            console.log('  ' + this.runCount + ': ' + queueItem.title);
            queueItem.createDirs.forEach(dir => this.createDir(dir));
            const process = spawn(Utils.getCliArg('command', queueItem.command), queueItem.args);
            if (Utils.existsCliSwitch('verbose')) {
                console.log('    Command: ' + queueItem.command);
                console.log('    Arguments: ', queueItem.args);
                console.log();
            }
            process.on('exit', (code) => {
                if (code === 0) {
                    this.successfulBuilds.push(queueItem.title);
                } else {
                    this.failedBuilds.push(queueItem.title);
                }
                this.processCount--;
                this.runNext();
            });
        } else if (this.successfulBuilds.length + this.failedBuilds.length >= this.queue.length) {
            this.printReport();
        }
    }

    createDir(dir) {
        fs.mkdirSync(path.resolve('./') + '/' + dir, {recursive: true});
    }

    printReport() {
        console.log(
            "\n" +
            "################################################################################\n" +
            "### Done:       " + this.runCount + "\n" +
            "### Successful: " + this.successfulBuilds.length + "\n" +
            "### Failed:     " + this.failedBuilds.length + (this.failedBuilds.length > 0 ? " (" + this.failedBuilds.join(', ') + ")" : '') + "\n" +
            "### \n" +
            "### Duration:   " + this.getDuration() + "s\n" +
            "################################################################################"
        );
    }

    getDuration() {
        const duration = ((new Date()).getTime() - this.startTime) / 1000;
        const minutes = Math.floor(duration / 60);
        const seconds = (duration % 60) < 10 ? '0' + Math.floor(duration % 60) : Math.floor(duration % 60);
        return minutes + ':' + seconds;
    }
}

class Metcalf {
    queue = [];
    config;

    constructor() {
        this.loadConfig();
        this.validateConfig();
        this.buildQueue();
        this.runQueue();
    }

    loadConfig() {
        if (!fs.existsSync('Metcalf.json')) {
            Utils.exitWithError('No "Metcalf.json" file found in current directory.', false, false);
        }
        this.config = JSON.parse(fs.readFileSync('Metcalf.json'));
    }

    validateConfig() {
        if (!this.config.tasks) {
            Utils.exitWithError('No tasks defined in Metcalf.json.', false, true);
        }
        if (!this.config.command) {
            Utils.exitWithError('No command defined in Metcalf.json.', false, true);
        }
    }

    buildQueue() {
        Object.entries(this.config.tasks).forEach(([taskId, task]) => {
            if (this.shouldTaskBeIncluded(task, taskId)) {
                (new Task(this.config, taskId, task)).enqueueJobs(this.queue);
            }
        });
    }

    shouldTaskBeIncluded(task, taskId) {
        const cliTasks = Utils.getCliArgSplitBy('tasks', ',', null);
        if (!cliTasks) {
            return !task.hasOwnProperty('manualOnly') || !task.manualOnly;
        } else {
            return cliTasks.includes(taskId);
        }
    }

    runQueue() {
        const queueRunner = new QueueRunner(this.config, this.queue);
        queueRunner.runQueue();
    }
}

new Metcalf();

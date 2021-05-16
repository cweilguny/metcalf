# Metcalf

Metcalf is a task runner to run tasks with sets of variables,
configured in a JSON file.

It can be configured everywhere, you just need a `Metcalf.json` file
wherever you wanna use metcalf.

Every task in the `Metcalf.json` contains a `run` section which is
an array of sets to be used. The combination of each variable of each set
in the run section will be created - also known as cartesian product.
For every resulting combination, a job is created. Every job
will be run using the command configured in `Metcalf.json` combined with
the `commandArgs` defined for each task. The commandArgs may contain `@key@`
references, where `key` is the name of a set included in the `run` section.
Those references will be replaced by the value of `key` in the current
combination of set variables.


# Usage

- Install using npm: `npm install -g metcalf`
- Create a `Metcalf.json` wherever you need metcalf.
  Refer to [Metcalf.json reference](Metcalf.json reference)
  or the [Metcalf.example.json](Metcalf.example.json) file.
  for a feature complete example.
- Run `metcalf` inside the directory where you placed
  the `Metcalf.json` file.

  
# Metcalf.json reference
**Note about this example JSON:** Be aware, that JSON
is a data-only format and must not contain comments.
This reference uses the contents of
[Metcalf.example.json](Metcalf.example.json)
with comments added in common // style for documentation.
If you wanna use the example as template or to try out
metcalf, then use the actual file
[Metcalf.example.json](Metcalf.example.json)
which doesn't contain the comments and is a valid JSON file.

```javascript
{
  // The command to be used for every single job
  "command": "touch",
  // OPTIONAL; Maximum number of parallel job executions;
  // will default to 1 if not defined        
  "maxWorkers": 2,
  // Global sets of variables; will have least precedence        
  "sets": {
    // A numeric set of variables, called "nr"
    "nr": [1, 2, 3],
    // A textual set of variables, calls "color"
    "color": ["red", "green", "blue"],
    // Another textual set of variables, calls "color"
    "unused": ["this", "is", "not", "used"]
  },
  // Definition of the tasks
  "tasks": {
    // Start of a task, the JSON key of the task is just
    // for usage in error messages
    "colors": {
      // Title of the task which will be printed for every job started;
      // @...@ are references to set variables
      "title": "Change mtime of file example/@color@/NR@nr@.txt",
      // A combination of all values of every set mentioned in "run"
      // will be created for each task.
      // In math terms: The cartesian product of the sets mentioned
      // here will be created. The task will be run for every resulting
      // combination of set variables.
      // THIS is actually all metcalf is about.
      "run": [
        // Include the "nr" set
        "nr",
        // Include the "color" set
        "color"
      ],
      // Arguments passed to the command defined globally in this file
      // (see the "command" line on top of the file)
      "commandArgs": [
        // First argument; In case of the touch command used in this
        // example, "-m" means "change only the modification time"
        "-m",
        // Second argument; In case of the touch command the complete
        // path of the file to touch. @...@ again are references to the
        // set variables. They will be replaced for every single
        // job/variable combination.
        "example/@color@/NR@nr@.txt" 
      ],
      // OPTIONAL; Create directories mentioned here; @...@ again are
      // references to the set variables and will be replaced for
      // every single job/variable combination.
      "createDirs": [
        "example/@color@"
      ]
    },
    // Another task
    "task-with-inner-set": {
      "title": "Touch file example/@inner@/NR@nr@.txt",
      // If "manualOnly" is set to true on a task, then the task
      // will only be included, if it is given by CLI
      // in the tasks=... argument
      "manualOnly": true,
      // Sets can also be defined on task level; task level sets
      // override global sets if the key is the same; Task level
      // sets can be overridden by CLI level arguments
      // (see the "Overriding" sections below)
      "sets": { 
        "inner": ["foo", "bar", "baz"]
      },
      "run": [
        // Include the global "nr" set
        "nr",
        // Include the task level "inner" set
        "inner"
      ],
      "commandArgs": [
        // A single argument this time
        "example/@inner@/NR@nr@.txt"
      ],
      // OPTIONAL
      "createDirs": [
        // Directories of course can be without a @...@ reference
        "example/i_am_an_example",
        // A directory to create using the task level set variable "inner"
        "example/@inner@"
      ]
    }
  }
}
```

# Overriding via CLI arguments

You can override the following things by CLI arguments,
respective to the [Metcalf.example.json](Metcalf.example.json)
example file:


## command
```bash
metcalf command=rm
```
Overrides the configured command to be `rm` instead of `touch`.


## maxWorkers
```bash
metcalf maxWorkers=5
```
Overrides the configured maximum number of workers from `2` to `5`.
So the runner will always run 5 processes in parallel.


## sets
```bash
metcalf sets.color=blue,green
```
Overrides, which values of a set are executed. This works like a filter.
Therefore only values of a set that are configured inside the
`Metcalf.json` file are allowed. If you define an unconfigured
value, an error is thrown.


## Multiple overrides

Multiple overrides are allowed. For example:
```bash
metcalf command=rm maxWorkers=5
```

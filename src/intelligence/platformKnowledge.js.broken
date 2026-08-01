brainBus: {

    name: "BrainBus",

    domain: "intelligence",

    type: "system-message-bus",

    owner: "Platform Intelligence",

    description:
        "System-wide event bus responsible for transporting operational events between platform components. BrainBus provides publish/subscribe messaging, wildcard subscriptions, event routing and platform-wide observability.",

    purpose: [

        "Transport Events",

        "Connect Platform Components",

        "Broadcast Operational Changes",

        "Support Reasoning",

        "Enable Platform Awareness",

        "Coordinate Services"

    ],

    lifecycle: {

        startup:
            "Starts the event bus, initializes subscriptions and broadcasts system.health ONLINE.",

        runtime:
            "Routes events between publishers and subscribers using direct and wildcard channels.",

        shutdown:
            "Removes all subscriptions and gracefully stops message routing."

    },

    dependsOn: [

        "EventEmitter"

    ],

    provides: [

        "Publish / Subscribe",

        "Wildcard Routing",

        "Channel Registry",

        "System Event Distribution",

        "Operational Messaging"

    ],

    consumedBy: [

        "Intelligence Core",

        "Reasoning Engine",

        "Diagnosis Engine",

        "Incident Engine",

        "Remediation Engine",

        "Inspector Bridge",

        "Blockchain",

        "Treasury",

        "Ledger",

        "Dashboard",

        "Mission Control",

        "Telegram Alerts"

    ],

    publishes: [

        "system.health",

        "incident.created",

        "incident.updated",

        "incident.resolved",

        "health.updated",

        "operator.alert",

        "treasury.*",

        "ledger.*",

        "deposit.*",

        "withdrawal.*",

        "blockchain.*"

    ],

    subscribes: [

        "*"

    ],

    eventEnvelope: {

        channel: "string",

        payload: "object",

        meta: {

            timestamp: "ISO8601",

            source: "Component Name",

            correlationId: "Request / Order Correlation"

        }

    },

    healthChecks: [

        "Bus Started",

        "Subscriber Count",

        "Channel Availability",

        "Wildcard Routing",

        "Event Delivery"

    ],

    metrics: [

        "Messages Per Second",

        "Active Channels",

        "Subscribers",

        "Published Events",

        "Wildcard Dispatches",

        "Last Event Time"

    ],

    failureModes: [

        "No Subscribers",

        "Subscriber Exception",

        "Message Storm",

        "Memory Leak",

        "Duplicate Event",

        "Bus Not Started"

    ],

    recovery: {

        automatic: [

            "Continue Routing After Subscriber Failure",

            "Ignore Faulty Subscriber",

            "Restart Bus"

        ],

        manual: [

            "Inspect Subscription Map",

            "Review Event Channels",

            "Verify Component Registration"

        ]

    },

    notificationPolicy: {

        warning: [

            "Dashboard"

        ],

        critical: [

            "Telegram",

            "Mission Control",

            "Incident Engine"

        ]

    },

    criticality: "CRITICAL"

},

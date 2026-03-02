# Database Diagram — Next Dashboard

> [!NOTE]
> Generated from `schema.prisma` (SQL Server, 60+ tables).
> Relationships marked with `||--o{` = one-to-many, `||--||` = one-to-one, `}o--o{` = many-to-many via join.

---

## Full Entity-Relationship Diagram

```mermaid
erDiagram

    %% ═══════════════════════════════════════════
    %% CORE USER & PROFILE
    %% ═══════════════════════════════════════════

    User {
        string id PK
        string username UK
        string email UK
        string name
        string image
        string purchasedModules
        int credits
        string password
        string role
        string tier
        string stripeCustomerId
        string stripeSubscriptionId
        datetime subscriptionEnd
        string homeState
        datetime bfrExpiry
        datetime medicalExpiry
        string medicalClass
        string e2eePublicKeyJwk
    }

    UserKey {
        string userId PK
        string encryptionKey
    }

    UserPresence {
        string id PK
        string userId UK
        boolean isOnline
        datetime lastSeenAt
    }

    PilotProfile {
        string id PK
        string userId UK
        string homeAirport
        string ratings
        string availability
        int hours
        string bio
    }

    UserContact {
        string id PK
        string userId UK
        string phone
        string address1
        string city
        string state
        string postalCode
        string country
    }

    PilotMedical {
        string id PK
        string userId UK
        string medicalClass
        string certificateNumber
        datetime issueDate
        datetime expirationDate
    }

    PilotLicense {
        string id PK
        string userId FK
        string type
        string number
        datetime issueDate
        string ratings
    }

    UserPreferences {
        string id PK
        string userId UK
        string distanceUnit
        string temperatureUnit
        string timeFormat
        string dateFormat
    }

    UserNotificationSettings {
        string id PK
        string userId UK
        boolean maintenanceAlerts
        boolean currencyReminders
        boolean weatherAlerts
    }

    User ||--|| UserPresence : "has"
    User ||--|| PilotProfile : "has"
    User ||--|| UserContact : "has"
    User ||--|| PilotMedical : "has"
    User ||--o{ PilotLicense : "holds"
    User ||--|| UserPreferences : "has"
    User ||--|| UserNotificationSettings : "has"

    %% ═══════════════════════════════════════════
    %% LOGBOOK SYSTEM
    %% ═══════════════════════════════════════════

    LogbookEntry {
        string id PK
        string userId FK
        datetime date
        string aircraft
        string aircraftId FK
        string routeFrom
        string routeTo
        float totalTime
        float picTime
        float nightTime
        float instrumentTime
        float crossCountryTime
        int dayLandings
        int nightLandings
        int approaches
        string instructorId FK
        string studentId FK
        string routeId FK
    }

    LogbookAttachment {
        string id PK
        string logbookEntryId FK
        string fileUrl
        string fileName
        string mimeType
    }

    LogbookStartingTotal {
        string id PK
        string userId UK
        float totalTime
        float picTime
        float nightTime
        float instrumentTime
        int landingsDay
        int landingsNight
    }

    LogbookPreferences {
        string id PK
        string userId UK
        string timeDisplayFormat
        string sumTimeMode
        string preferredTimeZone
        boolean showInstructorTime
        string defaultTemplateId
    }

    LogbookTemplate {
        string id PK
        string userId FK
        string name
        string fieldsJson
    }

    LogbookSharingLink {
        string id PK
        string userId FK
        string token UK
        string label
        string scope
    }

    LogbookCustomRule {
        string id PK
        string userId FK
        string name
        string ruleJson
    }

    LogbookDeadline {
        string id PK
        string userId FK
        string aircraftId FK
        string name
        datetime dueDate
        float dueHours
    }

    LogbookImport {
        string id PK
        string userId FK
        string source
        string status
        string fileUrl
    }

    User ||--o{ LogbookEntry : "logs"
    User ||--|| LogbookStartingTotal : "has"
    User ||--|| LogbookPreferences : "has"
    User ||--o{ LogbookTemplate : "creates"
    User ||--o{ LogbookSharingLink : "shares"
    User ||--o{ LogbookCustomRule : "defines"
    User ||--o{ LogbookDeadline : "tracks"
    User ||--o{ LogbookImport : "imports"
    LogbookEntry ||--o{ LogbookAttachment : "has"

    %% ═══════════════════════════════════════════
    %% AIRCRAFT
    %% ═══════════════════════════════════════════

    AircraftModel {
        string id PK
        string manufacturer
        string model
        string categoryClass
        string engineType
        boolean isComplex
        boolean isHighPerformance
        boolean isMultiEngine
    }

    AircraftProfile {
        string id PK
        string userId FK
        string nNumber
        string nickname
        string modelId FK
        string categoryClass
    }

    UserAircraft {
        string id PK
        string userId FK
        string nNumber
        string nickname
        string notes
    }

    AircraftMaster {
        string nNumber PK
        string name
        string mfr
        string model
        string serialNumber
        string engMfr
        string engineModel
        int engCount
    }

    AircraftPerformance {
        int id PK
        string designation
        string manufacturer
        string model
        string range_nm
        string mtow
        int num_engines
    }

    AircraftSpecs {
        int id PK
        string manufacturer
        string model
        string cruise_speed_kts
        string range_nm
        string fuel_capacity_gal
        string horsepower
    }

    AircraftCache {
        int id PK
        string manufacturer
        string model
        int cruise_speed_kts
        decimal burn_rate_gph
        int range_nm
        int pax_capacity
    }

    User ||--o{ AircraftProfile : "owns"
    User ||--o{ UserAircraft : "registers"
    AircraftModel ||--o{ AircraftProfile : "defines"
    AircraftProfile ||--o{ LogbookEntry : "used in"
    AircraftProfile ||--o{ LogbookDeadline : "has"

    %% ═══════════════════════════════════════════
    %% FLIGHT PLANNING & TRACKING
    %% ═══════════════════════════════════════════

    FlightPlan {
        string id PK
        string userId FK
        string name
        string callsign
        string aircraftType
        string departureIcao
        string arrivalIcao
        string alternateIcao
        int cruisingAlt
        boolean isFiled
    }

    FlightPlanWaypoint {
        string id PK
        string flightPlanId FK
        int sequence
        string icao
        float latitude
        float longitude
        int altitude
    }

    FlightTrack {
        string id PK
        string userId FK
        string name
        datetime date
        string trackData
        float totalDistance
        float maxAltitude
        float maxSpeed
    }

    FlightRoute {
        string id PK
        string userId FK
        string name
        string routeIcaos
        float totalDistanceNm
    }

    AirportVisit {
        string id PK
        string userId FK
        string icao
        datetime firstVisited
        datetime lastVisited
        int visits
    }

    User ||--o{ FlightPlan : "creates"
    FlightPlan ||--o{ FlightPlanWaypoint : "contains"
    User ||--o{ FlightTrack : "records"
    User ||--o{ FlightRoute : "saves"
    User ||--o{ AirportVisit : "visits"
    FlightRoute ||--o{ LogbookEntry : "referenced by"

    %% ═══════════════════════════════════════════
    %% TRAINING & CURRENCY
    %% ═══════════════════════════════════════════

    TrainingProgress {
        string id PK
        string userId UK
        int totalHours
        int soloHours
        int nightHours
        int instrumentHours
        int crossCountryHours
        boolean soloDone
    }

    TrainingGoal {
        string id PK
        string userId UK
        string goalType
        datetime targetDate
        boolean isActive
    }

    TrainingFinancials {
        string id PK
        string userId UK
        decimal aircraftRate
        decimal instructorRate
        decimal checkrideFee
        int flightsPerMonth
    }

    CurrencyRule {
        string id PK
        string authority
        string code UK
        string name
        string ruleJson
    }

    CurrencyStatus {
        string id PK
        string userId FK
        string ruleId FK
        string status
        datetime nextDueAt
    }

    CurrencyEvent {
        string id PK
        string userId FK
        string ruleCode
        datetime eventDate
    }

    User ||--|| TrainingProgress : "has"
    User ||--|| TrainingGoal : "sets"
    User ||--|| TrainingFinancials : "configures"
    User ||--o{ CurrencyStatus : "tracks"
    CurrencyRule ||--o{ CurrencyStatus : "evaluated by"
    User ||--o{ CurrencyEvent : "logs"

    %% ═══════════════════════════════════════════
    %% INSTRUCTOR & ENDORSEMENTS
    %% ═══════════════════════════════════════════

    InstructorProfile {
        string id PK
        string userId UK
        string certificateNumber
        string certificateType
        string verificationStatus
    }

    InstructorCertificate {
        string id PK
        string instructorId FK
        string fileUrl
        string fileName
    }

    Signature {
        string id PK
        string userId FK
        string type
        string svgData
        string typedName
        string hash
    }

    EndorsementTemplate {
        string id PK
        string authority
        string name
        string code
        string text
        string category
    }

    Endorsement {
        string id PK
        string templateId FK
        string studentId FK
        string instructorId FK
        string signatureId FK
        string logbookEntryId FK
        datetime signedAt
    }

    EndorsementRequest {
        string id PK
        string studentId FK
        string instructorId FK
        string templateId FK
        string status
        string message
    }

    User ||--|| InstructorProfile : "has"
    InstructorProfile ||--o{ InstructorCertificate : "uploads"
    User ||--o{ Signature : "creates"
    EndorsementTemplate ||--o{ Endorsement : "used in"
    Signature ||--o{ Endorsement : "signs"
    LogbookEntry ||--o{ Endorsement : "linked to"
    EndorsementTemplate ||--o{ EndorsementRequest : "requested for"

    %% ═══════════════════════════════════════════
    %% MESSAGING & SOCIAL
    %% ═══════════════════════════════════════════

    FriendRequest {
        string id PK
        string requesterId FK
        string recipientId FK
        string status
        string initialMessageEnvelope
    }

    Conversation {
        string id PK
        string listingId
    }

    ConversationParticipant {
        string id PK
        string conversationId FK
        string userId FK
        datetime lastReadAt
    }

    Message {
        string id PK
        string conversationId FK
        string senderId FK
        string body
        string bodyForSender
    }

    Conversation ||--o{ ConversationParticipant : "includes"
    Conversation ||--o{ Message : "contains"
    User ||--o{ ConversationParticipant : "joins"
    User ||--o{ Message : "sends"

    %% ═══════════════════════════════════════════
    %% FLYING CLUB
    %% ═══════════════════════════════════════════

    FlyingGroup {
        string id PK
        string name
        string description
        string ownerId
        decimal dryRate
        decimal wetRate
    }

    GroupMember {
        string id PK
        string userId FK
        string groupId FK
        string role
    }

    GroupMemberSettings {
        string id PK
        string userId FK
        string groupId FK
        string defaultTab
        boolean notifyMaintenance
        string maintenanceRole
    }

    Invite {
        string id PK
        string groupId FK
        string token UK
        string email
        string role
        datetime expiresAt
    }

    ClubAircraft {
        string id PK
        string groupId
        string nNumber
        string nickname
        decimal hourlyRate
        string make
        string model
    }

    Booking {
        string id PK
        string aircraftId
        string userId
        datetime startTime
        datetime endTime
        string purpose
    }

    PersonalBooking {
        string id PK
        string userId
        string userAircraftId
        datetime startTime
        datetime endTime
    }

    BlockOut {
        string id PK
        string groupId
        string aircraftId
        string title
        datetime startTime
        datetime endTime
    }

    GroupChatMessage {
        string id PK
        string groupId
        string userId
        string message
    }

    FlightLog {
        string id PK
        string aircraftId
        string userId
        datetime date
        decimal tachTime
        decimal hobbsTime
        decimal calculatedCost
    }

    Maintenance {
        string id PK
        string aircraftId
        string userId
        string description
        string status
        string category
        string severity
        boolean isGrounded
        decimal cost
    }

    FuelExpense {
        string id PK
        string aircraftId
        string userId
        decimal gallons
        decimal pricePerGallon
        decimal totalCost
        string status
    }

    PilotCurrency {
        string id PK
        string userId
        string groupId
        int dayLandings
        int nightLandings
        int approaches
    }

    NotificationPreference {
        string id PK
        string userId
        string groupId
        boolean emailBookingConfirm
        boolean smsUrgent
    }

    FlyingGroup ||--o{ GroupMember : "has"
    FlyingGroup ||--o{ GroupMemberSettings : "configures"
    FlyingGroup ||--o{ Invite : "issues"
    FlyingGroup ||--o{ Integration : "connects"
    User ||--o{ GroupMember : "joins"
    User ||--o{ GroupMemberSettings : "personalizes"

    %% ═══════════════════════════════════════════
    %% BILLING & INVOICING
    %% ═══════════════════════════════════════════

    BillingRun {
        string id PK
        string groupId
        string status
        decimal totalAmount
        int successCount
        int failureCount
    }

    Invoice {
        string id PK
        string groupId
        string userId
        string billingRunId
        decimal totalAmount
        string status
        string stripePaymentId
    }

    InvoiceItem {
        string id PK
        string invoiceId FK
        string flightLogId
        string aircraftId
        decimal hobbsHours
        decimal hourlyRate
        decimal amount
    }

    Invoice ||--o{ InvoiceItem : "contains"

    %% ═══════════════════════════════════════════
    %% MARKETPLACE
    %% ═══════════════════════════════════════════

    MarketplaceListing {
        string id PK
        string userId FK
        string type
        string title
        string aircraftType
        string airportIcao
        int price
        string nNumber
        string make
        string model
        string status
    }

    AircraftInquiry {
        string id PK
        string listingId FK
        string buyerId FK
        string message
        int offerAmount
        string status
    }

    User ||--o{ MarketplaceListing : "lists"
    MarketplaceListing ||--o{ AircraftInquiry : "receives"
    User ||--o{ AircraftInquiry : "inquires"

    %% ═══════════════════════════════════════════
    %% ENGINE HEALTH MONITORING
    %% ═══════════════════════════════════════════

    EngineDataUpload {
        string id PK
        string aircraftId
        string userId FK
        string fileName
        string fileType
        string data
    }

    EngineFlightData {
        string id PK
        string uploadId
        datetime flightDate
        decimal chtMax
        decimal egtMax
        decimal oilTempMax
        decimal fuelUsed
    }

    EngineAnomaly {
        string id PK
        string aircraftId
        string userId FK
        string type
        string severity
        decimal value
        string message
        boolean acknowledged
    }

    User ||--o{ EngineDataUpload : "uploads"
    User ||--o{ EngineAnomaly : "monitors"

    %% ═══════════════════════════════════════════
    %% MECHANIC MARKETPLACE
    %% ═══════════════════════════════════════════

    Mechanic {
        string id PK
        string userId UK
        string email UK
        string name
        string businessName
        string locationIcao
        string specialties
        decimal rating
        decimal hourlyRate
        boolean isVerified
    }

    MaintenanceRequest {
        string id PK
        string postedByUserId FK
        string title
        string description
        string aircraftType
        string airportIcao
        string category
        string urgency
        string status
        decimal budgetMin
        decimal budgetMax
    }

    MechanicQuote {
        string id PK
        string maintenanceRequestId FK
        string mechanicId FK
        decimal amount
        string description
        int estimatedDays
        string status
    }

    MechanicJobSchedule {
        string id PK
        string maintenanceRequestId FK
        string mechanicQuoteId FK
        datetime scheduledFor
        string status
    }

    MechanicReview {
        string id PK
        string mechanicId FK
        string reviewerId
        string maintenanceRequestId FK
        int rating
        string comment
    }

    MechanicFileRequest {
        string id PK
        string maintenanceRequestId FK
        string mechanicId FK
        string requestedFiles
        string status
    }

    User ||--|| Mechanic : "is"
    User ||--o{ MaintenanceRequest : "posts"
    MaintenanceRequest ||--o{ MechanicQuote : "receives"
    Mechanic ||--o{ MechanicQuote : "submits"
    MechanicQuote ||--o{ MechanicJobSchedule : "schedules"
    MaintenanceRequest ||--o{ MechanicJobSchedule : "scheduled via"
    MaintenanceRequest ||--o{ MechanicReview : "reviewed in"
    Mechanic ||--o{ MechanicReview : "reviewed as"
    MaintenanceRequest ||--o{ MechanicFileRequest : "requests files"
    Mechanic ||--o{ MechanicFileRequest : "receives request"

    %% ═══════════════════════════════════════════
    %% INTEGRATIONS (QuickBooks, etc.)
    %% ═══════════════════════════════════════════

    Integration {
        string id PK
        string groupId FK
        string provider
        string status
        string accessToken
        string refreshToken
        string realmId
        string config
    }

    QuickBooksMapping {
        string id PK
        string integrationId FK
        string entityType
        string entityId
        string qbType
        string qbId
    }

    SyncLog {
        string id PK
        string integrationId FK
        string syncType
        string direction
        string status
        int recordsTotal
        int recordsSuccess
    }

    Integration ||--o{ QuickBooksMapping : "maps"
    Integration ||--o{ SyncLog : "logs"

    %% ═══════════════════════════════════════════
    %% OUTREACH SYSTEM
    %% ═══════════════════════════════════════════

    OutreachContact {
        string id PK
        string organizationType
        string organizationName
        string airportIcao
        string contactName
        string contactEmail
        string state
    }

    OutreachCampaign {
        string id PK
        string name
        string subject
        string status
        int totalContacts
        int emailsSent
        int responses
    }

    OutreachEmail {
        string id PK
        string campaignId FK
        string contactId FK
        string toEmail
        string status
        string responseStatus
    }

    OutreachCampaign ||--o{ OutreachEmail : "sends"
    OutreachContact ||--o{ OutreachEmail : "receives"

    %% ═══════════════════════════════════════════
    %% CACHE & REFERENCE DATA
    %% ═══════════════════════════════════════════

    AirportCache {
        string icao PK
        string iata
        string name
        string city
        string state
        float latitude
        float longitude
        string type
    }

    FuelPriceCache {
        string icao PK
        decimal price100ll
        decimal priceJetA
        string source
    }

    CommunityFuelPrice {
        string id PK
        string icao
        string fbo
        string fuelType
        decimal price
        datetime purchaseDate
    }

    WeatherCache {
        string icao PK
        string station_type
        string raw_data
        datetime valid_from
        datetime valid_until
    }

    %% ═══════════════════════════════════════════
    %% OTHER
    %% ═══════════════════════════════════════════

    Document {
        string id PK
        string userId FK
        string name
        string type
        string fileUrl
    }

    ErrorReport {
        string id PK
        string userId FK
        string title
        string description
        string status
    }

    DemoData {
        string id PK
        string key UK
        boolean enabled
        string config
    }

    User ||--o{ Document : "stores"
    User ||--o{ ErrorReport : "reports"

```

---

## Domain Summary

See the in-file domain table for an overview of domains, tables and a short description of each area (Core User, Logbook, Aircraft, Flight Planning, Training, Marketplace, Billing, etc.).

## How to render

- In VS Code: install the "Markdown Preview Mermaid Support" or use the built-in Mermaid preview if available. Open this file and preview the Mermaid block.
- On GitHub: GitHub will render Mermaid diagrams in markdown when enabled; otherwise use a Mermaid live editor.
- Using mermaid-cli: install mermaid-cli and run `mmdc -i docs/database_diagram.md -o diagram.svg` (the mermaid block will need extraction into a `.mmd` file first).

## Next steps

- Verify any external relations (third-party services) or omitted join tables. The Prisma schema is the source-of-truth; if some relations aren't included in the schema, add them there.
- If you'd like, I can export a PNG/SVG snapshot of the diagram or split the diagram into domain-specific files for easier viewing.

---

Generated from `prisma/schema.prisma` on copy.

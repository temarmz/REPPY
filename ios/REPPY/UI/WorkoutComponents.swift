import SwiftUI

struct ReppyResultExerciseCard: View {
    var exercise: WorkoutExercise
    var results: [SetResult]
    var number: Int? = nil
    var relationshipID: String? = nil
    var body: some View {
        ReppyCard {
            ReppyExerciseHeader(exercise: exercise, number: number) { EmptyView() }
            if let note = exercise.coachNote, !note.isEmpty { ReppyCaption(text: note) }
            let recorded = results.filter { $0.exercise_instance_id == exercise.id }.sorted { $0.set_number < $1.set_number }
            ForEach(recorded) { result in
                ReppySetSummaryRow(number: result.set_number, value: (exercise.loadMode == .external ? "\(result.actual_weight.reppyNumber) кг × " : "") + "\(result.actual_reps) \(exercise.unit)", completed: result.completed)
            }
            if recorded.isEmpty { ReppyCaption(text: "Нет записанных подходов") }
            if let relationshipID { ReppyLink(title: "Прогресс упражнения", icon: "chart.xyaxis.line") { ProgressScreen(relationshipID: relationshipID, exerciseKey: exercise.progressKey) } }
        }
    }
}

struct ReppySessionSummary: View {
    var session: WorkoutSession
    var results: [SetResult]
    @Environment(\.dynamicTypeSize) private var typeSize
    private var elapsed: String {
        guard let start = ReppyDate.parse(session.started_at), let end = ReppyDate.parse(session.completed_at ?? "") else { return "—" }
        let seconds = max(0, Int(end.timeIntervalSince(start)))
        return ReppyElapsedTime.label(seconds: seconds)
    }
    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), alignment: .leading), count: typeSize.isAccessibilitySize ? 1 : 3), alignment: .leading, spacing: ReppyMetrics.space16) {
            item("Длительность", elapsed)
            item("Подходы", "\(results.filter(\.completed).count) из \(results.count)")
            item("Упражнения", String(session.workout_snapshot.exercises.count))
        }
    }
    private func item(_ title: String, _ value: String) -> some View {
        ReppyStack(compact: true) { ReppyCaption(text: title); ReppyHeading(text: value) }
    }
}
struct ReppySubscriptionEntry: View {
    var entry: SubscriptionEntry
    var balanceAfter: Int
    var card = true
    var body: some View {
        Group { if card { ReppyCard { row } } else { row.padding(ReppyMetrics.space16) } }.foregroundStyle(ReppyTheme.text)
    }
    private var row: some View {
        ReppyRow {
            Text("\(entry.lesson_delta > 0 ? "+" : "")\(entry.lesson_delta)").reppyTypography(.setNumber).monospacedDigit()
                .foregroundStyle(entry.lesson_delta > 0 ? ReppyTheme.trendUp : ReppyTheme.secondary)
                .frame(minWidth: ReppyMetrics.small, minHeight: ReppyMetrics.small)
            ReppyStack(compact: true) {
                ReppyHeading(text: entry.kind == "payment" ? "Пополнение на \(entry.lesson_delta) \(ReppySubscriptionSummary.lessonWord(entry.lesson_delta))" : entry.kind == "session-refund" ? "Возврат занятия" : "Занятие списано")
                let detail = entry.kind == "payment" ? "\((entry.amount_rub ?? 0).formatted(.number.locale(Locale(identifier: "ru_RU")))) ₽ · \(entry.payment_method == "transfer" ? "перевод" : "наличные")" : entry.workout_name ?? "Тренировка"
                ReppyCaption(text: detail + " · " + ReppySubscriptionDate.label(entry.occurred_at))
                if let comment = entry.comment, !comment.isEmpty { ReppyText(text: comment, tone: .secondary) }
                ReppyCaption(text: "Баланс после операции: \(balanceAfter)")
            }
            if entry.kind == "payment" { Image(systemName: "pencil").accessibilityLabel("Изменить пополнение") }
        }
    }
}
enum ReppySubscriptionDate {
    static func value(_ value: String) -> Date { ReppyDate.parse(value) ?? ReppyDate.fromDay(value) }
    static func label(_ value: String) -> String { self.value(value).formatted(.dateTime.day().month(.wide).year().locale(Locale(identifier: "ru_RU"))) }
}
struct ReppyConnectedList<Item: Identifiable, Content: View>: View {
    var items: [Item]
    @ViewBuilder var content: (Item) -> Content
    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                content(item)
                if index < items.count - 1 { Divider().overlay(ReppyTheme.divider) }
            }
        }.background(ReppyTheme.surface, in: RoundedRectangle(cornerRadius: ReppyMetrics.cardRadius))
    }
}
struct ReppyLedgerSummary<Action: View>: View {
    var balance: Int
    var hasEntries: Bool
    @ViewBuilder var action: () -> Action
    var body: some View {
        ReppyCard { ReppyCaption(text: "ТЕКУЩИЙ БАЛАНС"); ReppyTitle(text: ReppySubscriptionSummary.balanceLabel(balance, hasEntries: hasEntries)); action() }
    }
}
struct ReppyPaymentMethodPicker: View {
    @Binding var selection: String
    var body: some View {
        ReppyStack(compact: true) {
            ReppyCaption(text: "Способ оплаты")
            Picker("Способ оплаты", selection: $selection) { Text("Наличные").tag("cash"); Text("Перевод").tag("transfer") }.pickerStyle(.segmented).frame(minHeight: ReppyMetrics.compact)
        }
    }
}
struct ReppyInvitationReady: View {
    var name: String
    var link: String
    var expiresAt: Date?
    var demo: Bool
    var onDone: () -> Void
    @State private var copied = false
    var body: some View {
        ReppyCard {
            Image(systemName: "person.badge.plus").font(.largeTitle).foregroundStyle(ReppyTheme.trendUp).accessibilityHidden(true)
            ReppyHeading(text: "\(name) почти в команде")
            ReppyText(text: demo ? "Демо-приглашение: подключение ученика доступно после входа в рабочий аккаунт." : "Отправь эту одноразовую ссылку ученику.", tone: .secondary)
            if let expiresAt, !demo { ReppyCaption(text: "Действует до \(expiresAt.formatted(.dateTime.day().month(.wide).hour().minute().locale(Locale(identifier: "ru_RU"))))") }
            Text(link).reppyTypography(.body).textSelection(.enabled).fixedSize(horizontal: false, vertical: true).padding(ReppyMetrics.space16)
                .frame(maxWidth: .infinity, alignment: .leading).background(ReppyTheme.field, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius))
            ReppyButton(title: copied ? "Ссылка скопирована" : "Скопировать ссылку", icon: copied ? "checkmark" : "doc.on.doc", kind: .primary, disabled: demo) { UIPasteboard.general.string = link; copied = true }
            if !demo { ReppyShare(title: "Поделиться приглашением", item: link, kind: .secondary) }
            ReppyButton(title: "Готово", icon: "checkmark", action: onDone)
        }
    }
}

struct ReppyExerciseSectionHeader: View {
    var disabled = false
    var add: () -> Void
    var body: some View {
        HStack(spacing: ReppyMetrics.space12) {
            ReppyHeading(text: "Упражнения").frame(maxWidth: .infinity, alignment: .leading)
            Button(action: add) { ReppyToolbarIcon(icon: "plus") }.buttonStyle(.plain).disabled(disabled).accessibilityLabel("Добавить упражнение")
        }
    }
}

struct ReppyExerciseHeader<Actions: View>: View {
    var exercise: WorkoutExercise
    var number: Int? = nil
    @ViewBuilder var actions: () -> Actions
    var body: some View {
        VStack(alignment: .leading, spacing: ReppyMetrics.space8) {
            HStack(alignment: .top, spacing: ReppyMetrics.space12) {
                if let number { Text(String(format: "%02d", number)).reppyTypography(.caption).foregroundStyle(ReppyTheme.trendUp) }
                ReppyHeading(text: exercise.name).frame(maxWidth: .infinity, alignment: .leading)
                actions()
            }
            ReppyCaption(text: [exercise.primaryMuscle, exercise.equipment, exercise.loadMode == .bodyweight ? "Свой вес" : nil, exercise.measureType == .duration ? "Длительность" : nil].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
        }
    }
}
struct ReppyExerciseModes: View {
    @Binding var exercise: WorkoutExercise
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: ReppyMetrics.space8)) : AnyLayout(HStackLayout(spacing: ReppyMetrics.space8))
        layout {
            ReppyPicker(title: "Нагрузка", selection: $exercise.loadMode, compact: true) { Text("Внешний вес").tag(LoadMode.external); Text("Свой вес").tag(LoadMode.bodyweight) }
            ReppyPicker(title: "Измерение", selection: $exercise.measureType, compact: true) { Text("Повторы").tag(MeasureType.reps); Text("Длительность").tag(MeasureType.duration) }
        }
    }
}
struct ReppyDisclosure<Content: View>: View {
    var title: String
    @ViewBuilder var content: () -> Content
    var body: some View {
        DisclosureGroup(title, content: content).tint(ReppyTheme.text)
            .padding(ReppyMetrics.space12).background(ReppyTheme.button, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius))
    }
}
struct ReppyActiveExerciseCard: View {
    var exercise: WorkoutExercise
    @Binding var results: [SetResult]
    var number: Int? = nil
    var onInstruction: () -> Void
    var body: some View {
        ReppyCard {
            ReppyExerciseHeader(exercise: exercise, number: number) {
                Button(action: onInstruction) { ReppyToolbarIcon(icon: "questionmark.circle") }.buttonStyle(.plain).accessibilityLabel("Инструкция: \(exercise.name)")
            }
            if let note = exercise.coachNote, !note.isEmpty { ReppyText(text: note, tone: .secondary) }
            ReppyStack(compact: true) {
                SetColumnLabels(loadMode: exercise.loadMode, unit: exercise.unit)
                ForEach($results) { $result in
                    if result.exercise_instance_id == exercise.id { ActiveSetRow(exercise: exercise, result: $result, onChange: {}) }
                }
                if !results.contains(where: { $0.exercise_instance_id == exercise.id }) { ReppyCaption(text: "Подходы не заданы") }
            }
        }
    }
}
struct ReppyWorkoutSaveState: View {
    var status: String
    var saving: Bool
    var body: some View {
        HStack(spacing: ReppyMetrics.space8) {
            if saving { ProgressView().controlSize(.small) }
            Text(status).reppyTypography(.caption).foregroundStyle(ReppyTheme.secondary).lineLimit(2)
        }.accessibilityElement(children: .combine).accessibilityLabel("Сохранение тренировки").accessibilityValue(status).accessibilityIdentifier("workout-save-state")
    }
}

struct ReppyProfileSegments: View {
    @Binding var selection: String
    var body: some View {
        Picker("Раздел профиля", selection: $selection) { Text("Данные").tag("data"); Text("Прогресс").tag("progress") }.pickerStyle(.segmented).frame(minHeight: ReppyMetrics.small)
    }
}
struct ReppyStudentDetails: View {
    var student: Student
    var expanded = false
    var body: some View {
        if expanded {
            ReppyStack {
                ReppyRow {
                    ReppyHeading(text: "Данные и ограничения")
                    Spacer(minLength: 0)
                    NavigationLink { StudentFormScreen(student: student) } label: { ReppyToolbarIcon(icon: "pencil") }.buttonStyle(.plain).accessibilityLabel("Изменить личные данные")
                }
                ReppyStudentFacts(student: student)
                ReppyStack(compact: true) {
                    ReppyCaption(text: "Противопоказания и особенности")
                    ReppyText(text: student.contraindications?.isEmpty == false ? student.contraindications! : "Не указаны")
                }
            }
        } else {
        HStack(alignment: .top, spacing: ReppyMetrics.space12) {
            VStack(alignment: .leading, spacing: ReppyMetrics.space6) {
                let facts = [student.height_cm.map { "\($0.reppyNumber) см" }, student.weight_kg.map { "\($0.reppyNumber) кг" }, student.gender == "male" ? "Мужской" : student.gender == "female" ? "Женский" : nil, student.phone?.isEmpty == false ? student.phone : nil].compactMap { $0 }
                if !facts.isEmpty { ReppyCaption(text: facts.joined(separator: " · ")) }
                if let text = student.contraindications, !text.isEmpty { ReppyCaption(text: "Ограничения: \(text)") }
            }.frame(maxWidth: .infinity, alignment: .leading)
            NavigationLink { StudentFormScreen(student: student) } label: { ReppyToolbarIcon(icon: "pencil") }.buttonStyle(.plain).accessibilityLabel("Изменить личные данные")
        }
        }
    }
}
private struct ReppyStudentFacts: View {
    var student: Student
    @Environment(\.dynamicTypeSize) private var size
    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), alignment: .leading), count: size.isAccessibilitySize ? 1 : 2), alignment: .leading, spacing: ReppyMetrics.space16) {
            fact("Рост", student.height_cm.map { "\($0.reppyNumber) см" } ?? "Не указан")
            fact("Вес", student.weight_kg.map { "\($0.reppyNumber) кг" } ?? "Не указан")
            fact("Пол", student.gender == "male" ? "Мужской" : student.gender == "female" ? "Женский" : "Не указан")
            fact("Телефон", student.phone?.isEmpty == false ? student.phone! : "Не указан")
        }
    }
    private func fact(_ label: String, _ value: String) -> some View {
        ReppyStack(compact: true) { ReppyCaption(text: label); ReppyText(text: value) }.accessibilityElement(children: .combine)
    }
}
struct ReppyAvatar: View {
    var name: String
    var highlighted = false
    var body: some View {
        Text(name.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined().uppercased())
            .reppyTypography(.button).frame(width: ReppyMetrics.small, height: ReppyMetrics.small)
            .foregroundStyle(highlighted ? ReppyTheme.selectedText : ReppyTheme.secondary)
            .background(highlighted ? ReppyTheme.lime : ReppyTheme.button, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius))
            .accessibilityHidden(true)
    }
}
struct ReppyProfileIdentity: View {
    var name: String
    var role: String
    var student: Student? = nil
    var body: some View {
        ReppyCard {
            ReppyRow {
                ReppyAvatar(name: name, highlighted: true)
                ReppyStack(compact: true) { ReppyHeading(text: name); ReppyCaption(text: role) }
            }
            if let student { ReppyStudentDetails(student: student, expanded: true) }
        }
    }
}
struct ReppyScheduleHeader<Destination: View>: View {
    var date: Date
    var today = false
    var compactDate = false
    var actionLabel = "Назначить тренировку"
    @ViewBuilder var destination: () -> Destination
    var body: some View {
        ReppyRow {
            if today {
                ReppyTitle(text: "СЕГОДНЯ", subtitle: date.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(Locale(identifier: "ru_RU"))))
            } else if compactDate {
                ReppyHeading(text: date.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(Locale(identifier: "ru_RU"))))
            } else {
                HStack(spacing: ReppyMetrics.space12) {
                    ReppyNumber(value: date.formatted(.dateTime.day(.twoDigits)))
                    ReppyStack(compact: true) {
                        ReppyHeading(text: date.formatted(.dateTime.month(.wide).locale(Locale(identifier: "ru_RU"))))
                        ReppyCaption(text: date.formatted(.dateTime.weekday(.wide).locale(Locale(identifier: "ru_RU"))))
                    }
                }
            }
            Spacer(minLength: 0)
            NavigationLink(destination: destination) { ReppyToolbarIcon(icon: "plus") }.buttonStyle(.plain).accessibilityLabel(actionLabel)
        }
    }
}
struct ReppyScheduleLink<Destination: View>: View {
    var name: String
    var workout: String
    var time: String
    var completed = false
    @ViewBuilder var destination: () -> Destination
    var body: some View {
        NavigationLink(destination: destination) {
            ReppyRow {
                Text(time).reppyTypography(.button).monospacedDigit()
                ReppyAvatar(name: name)
                ReppyStack(compact: true) { ReppyHeading(text: name); ReppyCaption(text: workout) }
                if completed { Image(systemName: "checkmark.circle.fill").foregroundStyle(ReppyTheme.lime).accessibilityLabel("Завершена") }
                Image(systemName: "chevron.right").foregroundStyle(ReppyTheme.muted).accessibilityHidden(true)
            }.padding(ReppyMetrics.space16).frame(minHeight: ReppyMetrics.control)
                .background(ReppyTheme.surface, in: RoundedRectangle(cornerRadius: ReppyMetrics.cardRadius))
        }.buttonStyle(.plain)
    }
}
struct ReppyAgendaLink<Destination: View>: View {
    var title: String
    var subtitle: String
    var completed = false
    var card = true
    var leadingIcon: String? = nil
    @ViewBuilder var destination: () -> Destination
    var body: some View {
        NavigationLink(destination: destination) {
            HStack(spacing: ReppyMetrics.space12) {
                if let leadingIcon { Image(systemName: leadingIcon).font(.system(size: ReppyMetrics.iconSize)).foregroundStyle(ReppyTheme.trendUp).accessibilityHidden(true) }
                if completed { Image(systemName: "checkmark.circle.fill").foregroundStyle(ReppyTheme.lime).accessibilityLabel("Завершена") }
                VStack(alignment: .leading, spacing: ReppyMetrics.space6) {
                    Text(title).reppyTypography(.heading)
                    Text(subtitle).reppyTypography(.caption).foregroundStyle(ReppyTheme.secondary)
                }.frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").accessibilityHidden(true)
            }.foregroundStyle(ReppyTheme.text).padding(ReppyMetrics.space16).frame(minHeight: ReppyMetrics.control)
                .background(card ? ReppyTheme.surface : ReppyTheme.button, in: RoundedRectangle(cornerRadius: ReppyMetrics.cardRadius))
        }.buttonStyle(.plain)
    }
}
struct ReppyStudentContext: View {
    var name: String
    var body: some View {
        ReppyRow { ReppyAvatar(name: name); ReppyStack(compact: true) { ReppyCaption(text: "УЧЕНИК"); ReppyHeading(text: name) } }
    }
}
struct ReppyFormatPicker: View {
    @Binding var selection: TrainingFormat
    var body: some View {
        ReppyStack(compact: true) {
            ReppyCaption(text: "Формат")
            Picker("Формат", selection: $selection) { ForEach(TrainingFormat.allCases, id: \.self) { Text($0.title).tag($0) } }
                .pickerStyle(.segmented).frame(minHeight: ReppyMetrics.compact)
        }
    }
}
struct ReppyBalanceSummary: View {
    var balance: Int
    var body: some View {
        ReppyCard {
            ReppyRow {
                Image(systemName: balance <= 0 ? "exclamationmark.circle" : "checkmark").foregroundStyle(balance <= 2 ? ReppyTheme.warning : ReppyTheme.trendUp).accessibilityHidden(true)
                ReppyStack(compact: true) { ReppyCaption(text: "АБОНЕМЕНТ"); ReppyText(text: ReppySubscriptionSummary.balanceLabel(balance), tone: balance <= 0 ? .warning : .normal) }
            }
        }
    }
}
struct ReppySubscriptionSummary: View {
    var balance: Int
    var entries: [SubscriptionEntry]
    var trainer = false
    var relationshipID: String? = nil
    var body: some View {
        ReppyCard {
            ReppyRow { ReppyCaption(text: "АБОНЕМЕНТ"); Spacer(minLength: 0); ReppyCaption(text: "Без срока действия") }
            ReppyTitle(text: Self.balanceLabel(balance, hasEntries: !entries.isEmpty))
            if entries.isEmpty { ReppyCaption(text: trainer ? "Добавь первое пополнение, чтобы начать учёт занятий." : "Тренер ещё не добавил пополнение.") }
            else if balance <= 0 { ReppyCaption(text: balance < 0 ? "Новые занятия будут добавляться к долгу." : "Следующую тренировку можно провести в долг.") }
            let payments = entries.filter { $0.kind == "payment" }.sorted { $0.occurred_at == $1.occurred_at ? $0.created_at > $1.created_at : $0.occurred_at > $1.occurred_at }
            if !payments.isEmpty {
                ReppyCaption(text: trainer ? "ПОСЛЕДНЕЕ ПОПОЛНЕНИЕ" : "ПОСЛЕДНИЕ ПОПОЛНЕНИЯ")
                ForEach(Array(payments.prefix(trainer ? 1 : 3))) { entry in
                    ReppyStack(compact: true) {
                        ReppyHeading(text: "+\(entry.lesson_delta) \(Self.lessonWord(entry.lesson_delta))")
                        ReppyCaption(text: "\((entry.amount_rub ?? 0).formatted(.number.locale(Locale(identifier: "ru_RU")))) ₽ · \(entry.payment_method == "transfer" ? "перевод" : "наличные") · \(ReppySubscriptionDate.label(entry.occurred_at))")
                    }
                }
            }
            if trainer, let relationshipID {
                ReppyRow {
                    ReppyLink(title: payments.isEmpty ? "Добавить абонемент" : "Продлить", icon: "plus", kind: .primary) { PaymentFormScreen(relationshipID: relationshipID) }
                    ReppyLink(title: "История", icon: "clock.arrow.circlepath") { SubscriptionHistoryScreen(relationshipID: relationshipID) }
                }
            }
        }
    }
    static func lessonWord(_ value: Int) -> String {
        let count = abs(value), last = count % 10
        if (11...14).contains(count % 100) { return "занятий" }
        return last == 1 ? "занятие" : (2...4).contains(last) ? "занятия" : "занятий"
    }
    static func balanceLabel(_ balance: Int, hasEntries: Bool = true) -> String {
        guard hasEntries else { return "Абонемент не добавлен" }
        if balance == 0 { return "Абонемент закончился" }
        return balance > 0 ? "Осталось \(balance) \(lessonWord(balance))" : "\(abs(balance)) \(lessonWord(balance)) в долг"
    }
}
struct ReppyStudentLink<Destination: View>: View {
    var name: String
    var status: String
    var balance: Int
    var hasSubscription: Bool
    @ViewBuilder var destination: () -> Destination
    var body: some View {
        NavigationLink(destination: destination) {
            ReppyRow {
                ReppyAvatar(name: name)
                ReppyStack(compact: true) {
                    ReppyHeading(text: name)
                    ReppyCaption(text: status)
                    Text(ReppySubscriptionSummary.balanceLabel(balance, hasEntries: hasSubscription)).reppyTypography(.button)
                        .foregroundStyle(hasSubscription && balance <= 0 ? ReppyTheme.warning : ReppyTheme.trendUp)
                }
                Image(systemName: "chevron.right").foregroundStyle(ReppyTheme.muted).accessibilityHidden(true)
            }.padding(ReppyMetrics.space16).frame(minHeight: ReppyMetrics.control)
                .background(ReppyTheme.surface, in: RoundedRectangle(cornerRadius: ReppyMetrics.cardRadius))
        }.buttonStyle(.plain).accessibilityLabel(name + ", " + status + ", " + ReppySubscriptionSummary.balanceLabel(balance, hasEntries: hasSubscription))
    }
}
struct ReppyWorkoutFocus<Destination: View>: View {
    var name: String
    var schedule: String
    var preview: String
    var completed = false
    var progress: (completed: Int, total: Int)? = nil
    @ViewBuilder var destination: () -> Destination
    @ScaledMetric(relativeTo: .largeTitle) private var titleSize = ReppyMetrics.focusTitleFont
    var body: some View {
        VStack(alignment: .leading, spacing: ReppyMetrics.space16) {
            Text(schedule).reppyTypography(.caption).foregroundStyle(ReppyTheme.focusMeta)
            Spacer(minLength: ReppyMetrics.cardGap)
            Text(name).font(.system(size: titleSize, weight: .bold)).foregroundStyle(ReppyTheme.focusText).fixedSize(horizontal: false, vertical: true).accessibilityAddTraits(.isHeader)
            Text(preview).reppyTypography(.body).foregroundStyle(ReppyTheme.focusSecondary).fixedSize(horizontal: false, vertical: true)
            if let progress {
                ProgressView(value: Double(progress.completed), total: Double(max(1, progress.total))).tint(ReppyTheme.focusAccent)
                    .accessibilityLabel("Выполнено \(progress.completed) из \(progress.total) подходов")
                Text("Тренировка начата").reppyTypography(.caption).foregroundStyle(ReppyTheme.focusSecondary)
            }
            NavigationLink(destination: destination) { Label(completed ? "Посмотреть результат" : "Посмотреть тренировку", systemImage: "calendar") }
                .buttonStyle(ReppyButtonStyle(kind: .primary))
        }.padding(ReppyMetrics.focusInset).frame(maxWidth: .infinity, minHeight: ReppyMetrics.focusMinHeight, alignment: .leading)
            .background(ReppyTheme.focusSurface, in: RoundedRectangle(cornerRadius: ReppyMetrics.cardRadius))
    }
}
struct ExerciseProgressSummary: View {
    @EnvironmentObject private var store: AppStore
    var relationshipID: String
    var hideEmpty = false
    var body: some View {
        let groups = ExerciseProgress.collect(data: store.data, relationshipID: relationshipID)
        if !hideEmpty || !groups.isEmpty {
            ReppyHeading(text: "Прогресс по упражнениям")
            if groups.isEmpty { ReppyEmpty(title: "Пока нет прогресса", message: "Результаты упражнений появятся после первой завершённой тренировки.") }
            ForEach(groups) { group in
                ReppyProgressComparisonLink(group: group) { ProgressScreen(relationshipID: relationshipID, exerciseKey: group.id) }
            }
        }
    }
}
struct ReppyProgressComparisonLink<Destination: View>: View {
    var group: ProgressGroup
    @ViewBuilder var destination: () -> Destination
    var body: some View {
        NavigationLink(destination: destination) {
            ReppyRow {
                ReppyStack(compact: true) {
                    ReppyHeading(text: group.exercise.name)
                    if let comparison = ProgressComparison(group) {
                        if let previous = comparison.previous { ReppyCaption(text: "Было: \(setLabel(previous))") }
                        ReppyCaption(text: "\(comparison.previous == nil ? "" : "Стало: ")\(setLabel(comparison.latest))")
                        if comparison.previous != nil {
                            Text(changeLabel(comparison)).reppyTypography(.button).foregroundStyle(comparison.trend == .up ? ReppyTheme.trendUp : comparison.trend == .down ? ReppyTheme.trendDown : ReppyTheme.muted)
                        }
                    }
                }
                Image(systemName: "chevron.right").foregroundStyle(ReppyTheme.muted).accessibilityHidden(true)
            }.padding(ReppyMetrics.space16).background(ReppyTheme.surface, in: RoundedRectangle(cornerRadius: ReppyMetrics.cardRadius))
        }.buttonStyle(.plain)
    }
    private var unit: String { group.exercise.measureType == .duration ? "сек." : "повт." }
    private func setLabel(_ set: SetResult) -> String {
        (group.exercise.loadMode == .external ? "\(set.actual_weight.reppyNumber) кг × " : "") + "\(set.actual_reps) \(unit)"
    }
    private func signed(_ value: Double) -> String { "\(value > 0 ? "+" : "−")\(abs(value).reppyNumber)" }
    private func changeLabel(_ comparison: ProgressComparison) -> String {
        let weight = comparison.weightChange, amount = comparison.amountChange
        if weight == 0 && amount == 0 { return "Без изменений" }
        if weight != 0 && amount == 0 { return "\(signed(weight)) кг при \(group.exercise.measureType == .duration ? "том же времени" : "тех же повторах")" }
        return [weight != 0 ? "\(signed(weight)) кг" : nil, amount != 0 ? "\(signed(Double(amount))) \(unit)" : nil].compactMap { $0 }.joined(separator: ", ")
    }
}
import AVKit

struct PlanSetRow: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    var number: Int
    var loadMode: LoadMode
    var unit: String
    @Binding var set: SetPlan
    var onDelete: () -> Void
    var body: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: ReppyMetrics.space8)) : AnyLayout(HStackLayout(spacing: ReppyMetrics.space8))
        layout {
            Text(typeSize.isAccessibilitySize ? "Подход \(number)" : String(number)).font(.body).frame(width: typeSize.isAccessibilitySize ? nil : 24)
            if loadMode == .external {
                if typeSize.isAccessibilitySize { ReppyCaption(text: "Вес, кг") }
                ReppyNumericField(title: "Вес подхода \(number), кг", value: $set.targetWeight)
            }
            if typeSize.isAccessibilitySize { ReppyCaption(text: unit) }
            ReppyNumericField(title: "Подход \(number), \(unit)", value: Binding(get: { Double(set.targetReps) }, set: { set.targetReps = ReppyValidation.integer($0) }), integer: true)
            Button(action: onDelete) { ReppyToolbarIcon(icon: "minus") }.buttonStyle(.plain).accessibilityLabel("Удалить подход \(number)")
        }
    }
}
struct ActiveSetRow: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    var exercise: WorkoutExercise
    @Binding var result: SetResult
    var onChange: () -> Void
    var body: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: ReppyMetrics.space8)) : AnyLayout(HStackLayout(spacing: ReppyMetrics.space8))
        layout {
            Text(typeSize.isAccessibilitySize ? "Подход \(result.set_number)" : String(result.set_number)).font(.body).frame(width: typeSize.isAccessibilitySize ? nil : 24)
            if exercise.loadMode == .external {
                if typeSize.isAccessibilitySize { ReppyCaption(text: "Фактический вес, кг") }
                ReppyNumericField(title: "Фактический вес подхода \(result.set_number), кг", value: $result.actual_weight)
            }
            if typeSize.isAccessibilitySize { ReppyCaption(text: exercise.unit) }
            ReppyNumericField(title: "Фактически, \(exercise.unit), подход \(result.set_number)", value: Binding(get: { Double(result.actual_reps) }, set: { result.actual_reps = ReppyValidation.integer($0) }), integer: true)
            Button {
                result.completed.toggle(); UISelectionFeedbackGenerator().selectionChanged(); onChange()
            } label: {
                Image(systemName: result.completed ? "checkmark" : "circle").font(.system(size: 20, weight: .semibold))
                    .frame(width: ReppyMetrics.small, height: ReppyMetrics.small)
                    .foregroundStyle(result.completed ? ReppyTheme.selectedText : ReppyTheme.secondary)
                    .background(result.completed ? ReppyTheme.lime : ReppyTheme.button, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius))
            }.buttonStyle(.plain).accessibilityLabel("Подход \(result.set_number): \(result.completed ? "выполнен" : "не выполнен")")
                .accessibilityHint("\(exercise.name). \(result.completed ? "Снять отметку выполнения." : "Отметить подход выполненным.")")
                .accessibilityAddTraits(result.completed ? .isSelected : [])
        }
    }
}
struct SetColumnLabels: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    var loadMode: LoadMode
    var unit: String
    var body: some View {
        if !typeSize.isAccessibilitySize { HStack(spacing: 8) {
            Text("№").frame(width: 24)
            if loadMode == .external { Text("кг").frame(maxWidth: .infinity) }
            Text(unit).frame(maxWidth: .infinity)
            Color.clear.frame(width: ReppyMetrics.small, height: 1)
        }.font(.subheadline).foregroundStyle(ReppyTheme.secondary).accessibilityHidden(true) }
    }
}
struct ReadOnlyExerciseCard: View {
    var exercise: WorkoutExercise
    var results: [SetResult]? = nil
    var number: Int? = nil
    var relationshipID: String? = nil
    @State private var showInstruction = false
    var body: some View {
        ReppyCard {
            ReppyExerciseHeader(exercise: exercise, number: number) {
                Button { showInstruction = true } label: { ReppyToolbarIcon(icon: "questionmark.circle") }.buttonStyle(.plain).accessibilityLabel("Инструкция: \(exercise.name)")
            }
            if let note = exercise.coachNote, !note.isEmpty { ReppyText(text: note, tone: .secondary) }
            ForEach(Array(exercise.plannedSets.enumerated()), id: \.offset) { index, plan in
                let result = results?.first { $0.exercise_instance_id == exercise.id && $0.set_number == index + 1 }
                ReppySetSummaryRow(number: index + 1, value: (exercise.loadMode == .external ? "\((result?.actual_weight ?? plan.targetWeight).reppyNumber) кг × " : "") + "\(result?.actual_reps ?? plan.targetReps) \(exercise.unit)", completed: result?.completed)
            }
            if exercise.plannedSets.isEmpty { ReppyCaption(text: "Подходы не заданы") }
            if let relationshipID { ReppyLink(title: "Прогресс упражнения", icon: "chart.xyaxis.line") { ProgressScreen(relationshipID: relationshipID, exerciseKey: exercise.progressKey) } }
        }.sheet(isPresented: $showInstruction) { NavigationStack { InstructionScreen(exercise: exercise) }.presentationCornerRadius(ReppyMetrics.modalRadius) }
    }
}
struct ReppySetSummaryRow: View {
    var number: Int
    var value: String
    var completed: Bool? = nil
    var body: some View {
        ReppyRow {
            ReppyCaption(text: "Подход \(number)")
            Spacer(minLength: 0)
            Text(value).reppyTypography(.setNumber).monospacedDigit().fixedSize(horizontal: false, vertical: true)
            if let completed { Image(systemName: completed ? "checkmark" : "minus").foregroundStyle(completed ? ReppyTheme.trendUp : ReppyTheme.muted).accessibilityLabel(completed ? "Выполнено" : "Не выполнено") }
        }.frame(minHeight: ReppyMetrics.small).accessibilityElement(children: .combine)
    }
}
enum ReppyElapsedTime {
    static func label(seconds: Int) -> String {
        let seconds = max(0, seconds)
        return seconds >= 3600 ? String(format: "%d:%02d:%02d", seconds / 3600, (seconds / 60) % 60, seconds % 60) : String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }
}
struct ReppyWorkoutOverview: View {
    var elapsed: String
    var completed: Int
    var total: Int
    var body: some View {
        ReppyStack(compact: true) {
            ReppyRow {
                Label(elapsed, systemImage: "timer").reppyTypography(.heading).monospacedDigit().accessibilityLabel("Время тренировки: \(elapsed)")
                Spacer(minLength: 0)
                ReppyCaption(text: "\(total > 0 ? Int(Double(completed) / Double(total) * 100) : 0)% · \(completed) из \(total) подходов")
            }
            ReppyProgressBar(completed: completed, total: total)
        }
    }
}
struct ReppyFeedbackSummary: View {
    var mood: Mood?
    var comment: String?
    var body: some View {
        ReppyCard {
            ReppyCaption(text: "ОБРАТНАЯ СВЯЗЬ УЧЕНИКА")
            if let mood { Label(mood.title, systemImage: "sun.max").reppyTypography(.heading) }
            if let comment, !comment.isEmpty { ReppyText(text: comment, tone: .secondary) }
        }
    }
}
struct ReppyChargeSummary: View {
    var charged: Bool
    var body: some View {
        ReppyCard {
            ReppyRow {
                Image(systemName: charged ? "checkmark" : "minus").foregroundStyle(ReppyTheme.trendUp).accessibilityHidden(true)
                ReppyStack(compact: true) {
                    ReppyCaption(text: "АБОНЕМЕНТ")
                    ReppyText(text: charged ? "Одно занятие списано" : "Занятие не списано")
                }
            }
        }
    }
}
struct InstructionScreen: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    var exercise: WorkoutExercise
    @State private var player: AVPlayer?
    @State private var error: String?
    var body: some View {
        ReppyPage(back: true) {
            ReppyTitle(text: exercise.name)
            ReppyCard {
                ReppyText(text: exercise.instructionText?.isEmpty == false ? exercise.instructionText! : "Тренер пока не добавил подробную инструкцию.", tone: .secondary)
                if let player { ReppyVideo(player: player) }
                if let error { ReppyStatus(message: error, error: true) }
                if let video = exercise.instructionVideo {
                    ReppyButton(title: "Открыть видео", icon: "play.circle") {
                        Task { do { player = AVPlayer(url: try await store.videoURL(video)); error = nil } catch { self.error = error.localizedDescription } }
                    }
                }
            }
            ReppyButton(title: "Закрыть", compact: true) { dismiss() }
        }.onDisappear { player?.pause(); player = nil }
    }
}
struct ReppyVideo: View {
    var player: AVPlayer
    var body: some View { VideoPlayer(player: player).aspectRatio(9 / 16, contentMode: .fit).clipShape(RoundedRectangle(cornerRadius: ReppyMetrics.radius)) }
}

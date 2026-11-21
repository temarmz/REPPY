import SwiftUI

private let reppyMuscles = ["Грудь", "Спина", "Плечи", "Бицепс", "Трицепс", "Квадрицепс", "Ягодицы", "Задняя поверхность бедра", "Икры", "Кор"]
private extension ExerciseDefinition {
    func matchesSearch(_ search: String) -> Bool {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        let groups = muscle_groups.isEmpty ? [primary_muscle] : muscle_groups
        return query.isEmpty || ([name] + groups + [equipment]).joined(separator: " ")
            .range(of: query, options: .caseInsensitive, locale: Locale(identifier: "ru_RU")) != nil
    }
    static func ordered(_ first: Self, _ second: Self) -> Bool {
        let order = first.name.compare(second.name, locale: Locale(identifier: "ru_RU"))
        return order == .orderedSame ? first.id < second.id : order == .orderedAscending
    }

    var metadata: String {
        exerciseMetadata(groups: muscle_groups.isEmpty ? [primary_muscle] : muscle_groups, equipment: equipment,
                         isCustom: owner_id != nil, loadMode: load_mode, measureType: measure_type)
    }
}

struct ExercisePickerScreen: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    var onChoose: ((ExerciseDefinition) -> Void)?
    var exercises: Binding<[WorkoutExercise]>?
    var keepLastExercise = false
    @State private var search = ""
    @State private var muscle = "Все"
    @State private var createDefinition = false
    init(onChoose: @escaping (ExerciseDefinition) -> Void) { self.onChoose = onChoose; exercises = nil }
    init(exercises: Binding<[WorkoutExercise]>, keepLastExercise: Bool = false) { self.exercises = exercises; self.keepLastExercise = keepLastExercise; onChoose = nil }
    private func add(_ definition: ExerciseDefinition) {
        if let exercises { exercises.wrappedValue.append(WorkoutExercise(definition: definition)) }
        else { onChoose?(definition) }
    }
    var body: some View {
        ReppyPage(back: true, nativeList: true, compactList: true, title: exercises == nil ? "Упражнение" : "Добавить упражнения") {
            ReppyPicker(title: "Мышечная группа", selection: $muscle) { Text("Все").tag("Все"); ForEach(reppyMuscles, id: \.self) { Text($0).tag($0) } }
            if store.isTrainer {
                ReppyButton(title: "Создать своё упражнение", icon: "plus") { createDefinition = true }
            }
            let definitions = store.data.definitions.filter { definition in
                definition.matchesSearch(search) && (muscle == "Все" || definition.muscle_groups.contains(muscle) || definition.primary_muscle == muscle)
            }.sorted(by: ExerciseDefinition.ordered)
            if definitions.isEmpty { ReppyEmpty(title: "Ничего не найдено", message: "Измени поиск или выбери другую мышечную группу.") }
            ForEach(definitions) { definition in
                if let exercises {
                    ReppyExerciseQuantityRow(name: definition.name, subtitle: definition.metadata,
                        count: exercises.wrappedValue.filter { $0.exerciseId == definition.id }.count,
                        canRemove: !keepLastExercise || exercises.wrappedValue.count > 1,
                        onRemove: {
                            guard !keepLastExercise || exercises.wrappedValue.count > 1 else { return }
                            if let index = exercises.wrappedValue.lastIndex(where: { $0.exerciseId == definition.id }) { exercises.wrappedValue.remove(at: index) }
                        }, onAdd: { add(definition) }).disabled(store.busy)
                } else { ReppyChoiceRow(title: definition.name, subtitle: definition.metadata) { add(definition) }.disabled(store.busy) }
            }
        }.toolbar { ToolbarItem(placement: .confirmationAction) { Button(exercises == nil ? "Закрыть" : "Готово") { dismiss() } } }
            .navigationDestination(isPresented: $createDefinition) { DefinitionFormScreen(onSaved: add) }
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: "Поиск")
    }
}
struct ExerciseLibraryScreen: View {
    @EnvironmentObject private var store: AppStore
    @State private var search = ""
    var body: some View {
        ReppyPage(back: true, title: "Библиотека упражнений") {
            ReppySearch(text: $search)
            ReppyLink(title: "Создать упражнение", icon: "plus") { DefinitionFormScreen() }
            let definitions = store.data.definitions.filter { $0.matchesSearch(search) }.sorted(by: ExerciseDefinition.ordered)
            if definitions.isEmpty {
                ReppyEmpty(title: search.isEmpty ? "Библиотека пока пуста" : "Ничего не найдено", message: search.isEmpty ? "Создай первое упражнение, чтобы использовать его в тренировках." : "Измени название в поиске или создай своё упражнение.")
            }
            ForEach(definitions) { definition in
                ReppyCard {
                    ReppyHeading(text: definition.name)
                    ReppyCaption(text: definition.metadata)
                    if definition.owner_id == store.profile?.id { ReppyLink(title: "Изменить", icon: "pencil") { DefinitionFormScreen(original: definition) } }
                }
            }
        }
    }
}
private struct DefinitionDraft: Codable, Equatable {
    var id: String; var name: String; var equipment: String; var groups: Set<String>; var loadMode: LoadMode; var measureType: MeasureType
}
struct DefinitionFormScreen: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    var original: ExerciseDefinition? = nil
    var onSaved: ((ExerciseDefinition) -> Void)? = nil
    @State private var id = UUID().uuidString.lowercased()
    @State private var name = ""
    @State private var equipment = ""
    @State private var groups: Set<String> = []
    @State private var loadMode = LoadMode.external
    @State private var measureType = MeasureType.reps
    @State private var initialized = false
    @State private var initialDraft: DefinitionDraft?
    private var formValue: DefinitionDraft { DefinitionDraft(id: id, name: name, equipment: equipment, groups: groups, loadMode: loadMode, measureType: measureType) }
    private var definition: ExerciseDefinition {
        let ordered = reppyMuscles.filter { groups.contains($0) }
        let trimmedEquipment = equipment.trimmingCharacters(in: .whitespacesAndNewlines)
        return ExerciseDefinition(id: original?.id ?? id, slug: nil, owner_id: store.profile?.id, name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            primary_muscle: ordered.first ?? "Другое", muscle_groups: ordered,
            equipment: trimmedEquipment.isEmpty ? (loadMode == .bodyweight ? "Свой вес" : "Другое") : trimmedEquipment,
            measure_type: measureType, load_mode: loadMode, archived_at: nil)
    }
    private var validationError: String? { ReppyValidation.definition(definition, definitions: store.data.definitions) }
    private var draftKey: String { "definition:\(original?.id ?? "new")" }
    var body: some View {
        ReppyPage(back: true, title: "Упражнение") {
            ReppyCaption(text: original == nil ? "Своё упражнение" : "Изменить упражнение")
            ReppyCard {
                ReppyField(title: "Название", text: $name, placeholder: "Например: тяга полотенца")
                ReppyField(title: "Оборудование", text: $equipment, placeholder: "Например: гантели")
                ReppyExerciseModes(loadMode: $loadMode, measureType: $measureType, compact: false)
                ReppyMultiplePicker(title: "Мышечные группы", options: reppyMuscles, selection: $groups)
                if let validationError { ReppyText(text: validationError, tone: .secondary) }
            }
        }.reppyFormActions(disabled: validationError != nil, busy: store.busy, hasChanges: initialDraft != nil && initialDraft != formValue, save: {
                let definition = self.definition
                Task { if await store.run({
                    try await store.saveDefinition(definition, isNew: original == nil)
                    try DraftStorage.remove(account: store.accountKey, key: draftKey)
                }) { onSaved?(definition); dismiss() } }
            }, discard: {
                do { try DraftStorage.remove(account: store.accountKey, key: draftKey); dismiss() } catch { store.present(error) }
            }).onAppear {
            guard !initialized else { return }; initialized = true
            if let original { id = original.id; name = original.name; equipment = original.equipment; groups = Set(original.muscle_groups); loadMode = original.load_mode; measureType = original.measure_type }
            initialDraft = formValue
            if let draft: DefinitionDraft = store.restoreDraft(key: draftKey) {
                id = draft.id; name = draft.name; equipment = draft.equipment; groups = draft.groups; loadMode = draft.loadMode; measureType = draft.measureType
            }

        }.onChange(of: [name, equipment, loadMode.rawValue, measureType.rawValue]) { _, _ in saveDraft() }.onChange(of: groups) { _, _ in saveDraft() }
    }
    private func saveDraft() {
        guard initialized else { return }
        do { try DraftStorage.save(DefinitionDraft(id: id, name: name, equipment: equipment, groups: groups, loadMode: loadMode, measureType: measureType), account: store.accountKey, key: draftKey) } catch { store.present(error) }
    }
}

import SwiftUI

private let reppyMuscles = ["Грудь", "Спина", "Плечи", "Бицепс", "Трицепс", "Квадрицепс", "Ягодицы", "Задняя поверхность бедра", "Икры", "Кор"]
struct ExercisePickerScreen: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    var onChoose: ((ExerciseDefinition) -> Void)?
    var exercises: Binding<[WorkoutExercise]>?
    @State private var search = ""
    @State private var muscle = "Все"
    init(onChoose: @escaping (ExerciseDefinition) -> Void) { self.onChoose = onChoose; exercises = nil }
    init(exercises: Binding<[WorkoutExercise]>) { self.exercises = exercises; onChoose = nil }
    private func add(_ definition: ExerciseDefinition) {
        if let exercises { exercises.wrappedValue.append(WorkoutExercise(definition: definition)) }
        else { onChoose?(definition) }
    }
    var body: some View {
        ReppyPage(back: true, nativeList: true, title: exercises == nil ? "Упражнение" : "Добавить упражнения") {
            ReppyPicker(title: "Мышечная группа", selection: $muscle) { Text("Все").tag("Все"); ForEach(reppyMuscles, id: \.self) { Text($0).tag($0) } }
            if store.isTrainer { ReppyLink(title: "Создать своё упражнение", icon: "plus") { DefinitionFormScreen(onSaved: add) } }
            let definitions = store.data.definitions.filter { definition in
                (search.isEmpty || definition.name.localizedCaseInsensitiveContains(search)) && (muscle == "Все" || definition.muscle_groups.contains(muscle) || definition.primary_muscle == muscle)
            }.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
            if definitions.isEmpty { ReppyEmpty(title: "Ничего не найдено", message: "Измени поиск или выбери другую мышечную группу.") }
            ForEach(definitions) { definition in
                if let exercises {
                    HStack(spacing: ReppyMetrics.space12) {
                        VStack(alignment: .leading, spacing: ReppyMetrics.space8) {
                            Text(definition.name).reppyTypography(.body)
                            Text(definition.equipment).reppyTypography(.caption).foregroundStyle(ReppyTheme.secondary)
                        }.frame(maxWidth: .infinity, alignment: .leading)
                        let count = exercises.wrappedValue.filter { $0.exerciseId == definition.id }.count
                        Button {
                            if let index = exercises.wrappedValue.lastIndex(where: { $0.exerciseId == definition.id }) { exercises.wrappedValue.remove(at: index) }
                        } label: { ReppyToolbarIcon(icon: "minus") }.disabled(count == 0).accessibilityLabel("Убрать \(definition.name)")
                        Text("\(count)").monospacedDigit().frame(minWidth: 20).accessibilityLabel("Добавлено: \(count)")
                        Button { add(definition) } label: { ReppyToolbarIcon(icon: "plus") }.accessibilityLabel("Добавить \(definition.name)")
                    }.disabled(store.busy)
                } else { ReppyChoiceRow(title: definition.name, subtitle: definition.equipment) { add(definition) }.disabled(store.busy) }
            }
        }.toolbar { ToolbarItem(placement: .confirmationAction) { Button(exercises == nil ? "Закрыть" : "Готово") { dismiss() } } }
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
            let definitions = store.data.definitions.filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) }.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
            if definitions.isEmpty {
                ReppyEmpty(title: search.isEmpty ? "Библиотека пока пуста" : "Ничего не найдено", message: search.isEmpty ? "Создай первое упражнение, чтобы использовать его в тренировках." : "Измени название в поиске или создай своё упражнение.")
            }
            ForEach(definitions) { definition in
                ReppyCard {
                    ReppyHeading(text: definition.name)
                    ReppyCaption(text: "\(definition.equipment) · \(definition.muscle_groups.joined(separator: ", "))")
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
    private var draftKey: String { "definition:\(original?.id ?? "new")" }
    var body: some View {
        ReppyPage(back: true, title: "Упражнение") {
            ReppyCaption(text: original == nil ? "Своё упражнение" : "Изменить упражнение")
            ReppyCard {
                ReppyField(title: "Название", text: $name)
                ReppyField(title: "Оборудование", text: $equipment)
                ReppyPicker(title: "Нагрузка", selection: $loadMode) { Text("Внешний вес").tag(LoadMode.external); Text("Свой вес").tag(LoadMode.bodyweight) }
                ReppyPicker(title: "Измерение", selection: $measureType) { Text("Повторы").tag(MeasureType.reps); Text("Длительность").tag(MeasureType.duration) }
                ReppyHeading(text: "Мышечные группы")
                ForEach(reppyMuscles, id: \.self) { muscle in
                    ReppyToggle(title: muscle, value: Binding(get: { groups.contains(muscle) }, set: { if $0 { groups.insert(muscle) } else { groups.remove(muscle) } }))
                }
            }
        }.reppyFormActions(disabled: name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, busy: store.busy, hasChanges: initialDraft != nil && initialDraft != formValue, save: {
                let ordered = reppyMuscles.filter { groups.contains($0) }
                let definition = ExerciseDefinition(id: original?.id ?? id, slug: nil, owner_id: store.profile?.id, name: name,
                    primary_muscle: ordered.first ?? "Другое", muscle_groups: ordered, equipment: equipment.isEmpty ? "Другое" : equipment,
                    measure_type: measureType, load_mode: loadMode, archived_at: nil)
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

# 📋 API Contract Update v2.5.1

## 🎯 **Что изменилось**

### **Новая версия:** 2.4.1 → **2.5.1**

---

## ✨ **Добавленные компоненты**

### **Новые схемы:**
- **`BulkTagsRequest`** - запрос для массовых операций с тегами
- **`BulkTagsResponse`** - ответ массовых операций с результатами

### **Новые эндпоинты:**
- **`POST /api/ai-items/bulk/tags/add`** - массовое добавление тегов
- **`POST /api/ai-items/bulk/tags/remove`** - массовое удаление тегов

---

## 🔧 **Технические детали**

### **BulkTagsRequest:**
```yaml
type: object
required: [itemIds, tagCodes]
properties:
  itemIds: # массив ID элементов
    type: array
    items: { type: string }
    minItems: 1
  tagCodes: # массив кодов тегов
    type: array
    items: { type: string }
    minItems: 1
```

### **BulkTagsResponse:**
```yaml
type: object
required: [success, processedItems]
properties:
  success: { type: boolean, enum: [true] }
  processedItems: { type: integer, minimum: 0 }
  failedItems: # опциональный массив ошибок
    type: array
    items:
      type: object
      required: [itemId, error]
```

---

## 📁 **Структура изменений**

```
contract/
├── api-contract.yaml                    # ✅ Обновлен
├── README_Contract_changes_v2.5.1.md   # 🆕 Новый
└── BACKEND_IMPLEMENTATION_v2.5.1.md    # 🆕 Новый
```

---

## 🎯 **Для фронтенда**
✅ **Готово**: Реализация UI для массовых операций завершена  
✅ **Готово**: TypeScript типы обновлены  
✅ **Готово**: API клиент поддерживает новые методы  

---

## 🎯 **Для бэкенда**
🔄 **TODO**: Реализация новых эндпоинтов  
📋 **См.**: `BACKEND_IMPLEMENTATION_v2.5.1.md` для подробных инструкций  

---

## 🚀 **Готовность к релизу**

| Компонент | Статус |
|-----------|---------|
| API Contract | ✅ Готов |
| Frontend UI | ✅ Готов |
| Backend API | ❌ Требуется реализация |
| Documentation | ✅ Готова |

---

## 📝 **Примечания**

- Все изменения обратно совместимы
- Массовые операции поддерживают до 100 элементов за раз
- Операции идемпотентны (безопасны для повторного вызова)
- Изоляция по `context-code` сохранена

---

## 📞 **Next Steps**

1. **Backend Team**: Реализовать новые эндпоинты согласно `BACKEND_IMPLEMENTATION_v2.5.1.md`
2. **QA Team**: Добавить тесты для bulk операций
3. **DevOps**: Обновить Swagger UI с новым контрактом

---

*Дата обновления: $(Get-Date)*  
*Автор: Frontend Development Team*
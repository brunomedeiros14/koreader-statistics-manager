local _ = require("gettext")
local Button = require("ui/widget/button")
local ButtonDialog = require("ui/widget/buttondialog")
local Device = require("device")
local Font = require("ui/font")
local Screen = Device.screen
local Size = require("ui/size")
local TextBoxWidget = require("ui/widget/textboxwidget")
local UIManager = require("ui/uimanager")
local VerticalSpan = require("ui/widget/verticalspan")

local PaginatedList = ButtonDialog:extend{
    title = nil,
    items = nil, -- array of strings, or of { text=..., value=... }
    page = 1,
    per_page = 5,
    on_item = nil, -- function(value): item tapped (chosen)
    on_prev = nil, -- function(): user tapped previous page
    on_next = nil, -- function(): user tapped next page
    on_cancel = nil,
}

function PaginatedList:init()
    local n = #self.items
    self.pages = math.max(1, math.ceil(n / self.per_page))

    local content_w = math.floor(
        math.min(Screen:getWidth(), Screen:getHeight()) * 0.9
    ) - 2 * Size.border.window - 2 * Size.padding.button

    self._added_widgets = {}
    table.insert(self._added_widgets, TextBoxWidget:new{
        text = string.format(_("Página %d de %d"), self.page, self.pages),
        width = content_w,
        face = Font:getFace("smallinfofont"),
        alignment = "center",
    })
    table.insert(self._added_widgets, VerticalSpan:new{ width = Size.span.vertical_default })

    local start = (self.page - 1) * self.per_page + 1
    local stop = math.min(start + self.per_page - 1, n)
    for i = start, stop do
        local entry = self.items[i]
        local item_text = type(entry) == "table" and tostring(entry.text) or tostring(entry)
        local value = type(entry) == "table" and entry.value or entry
        table.insert(self._added_widgets, Button:new{
            text = "◦ " .. item_text,
            width = content_w,
            bordersize = 0,
            callback = function()
                UIManager:close(self)
                if self.on_item then
                    self.on_item(value)
                end
            end,
        })
        table.insert(self._added_widgets, VerticalSpan:new{ width = Size.span.vertical_default })
    end

    self.buttons = {
        {
            {
                text = _("‹ Anterior"),
                enabled = self.page > 1,
                callback = function()
                    UIManager:close(self)
                    if self.on_prev then
                        self.on_prev()
                    end
                end,
            },
            {
                text = _("Próxima ›"),
                enabled = self.page < self.pages,
                callback = function()
                    UIManager:close(self)
                    if self.on_next then
                        self.on_next()
                    end
                end,
            },
        },
        {
            {
                text = _("Cancelar"),
                id = "close",
                callback = function()
                    UIManager:close(self)
                    if self.on_cancel then
                        self.on_cancel()
                    end
                end,
            },
        },
    }

    ButtonDialog.init(self)
end

return PaginatedList

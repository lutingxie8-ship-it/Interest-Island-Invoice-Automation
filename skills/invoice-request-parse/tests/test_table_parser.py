"""回归测试：table_parser.parse_xlsx（优化 A — openpyxl 直读替代 HTML 中转）。

覆盖：
- 字段列冲突（表头「公司名称」「商品名称」同含「名称」别名 → 取最长别名列）
- openpyxl 直读主路径正确解析
- 空输入 / 损坏输入安全返回
"""
from skill.src.table_parser import TableParser


def test_parse_xlsx_field_conflict_takes_longest_alias(base_config, xlsx_bytes_field_conflict):
    """关键回归：title 应映射到「购买方名称」列，而非「商品名称」列。"""
    p = TableParser(base_config)
    res = p.parse_xlsx(xlsx_bytes_field_conflict)
    assert res.success, "宽表应解析成功"
    assert len(res.orders) == 1
    o = res.orders[0]
    # 核心断言：title 取购买方名称列，不是商品名称列
    assert o.title == "青岛博威斯机械有限公司"
    assert o.title != "咨询服务费"
    assert o.amount_raw == "3904"
    assert o.order_id_raw == "9000000779908504"
    assert o.tax_id == "91370202MA7L5FEF9U"
    assert o.note == "测试备注"


def test_parse_xlsx_openpyxl_direct_read(base_config, xlsx_bytes_simple):
    """openpyxl 直读：标准别名字段正确解析。"""
    p = TableParser(base_config)
    res = p.parse_xlsx(xlsx_bytes_simple)
    assert res.success
    o = res.orders[0]
    assert o.order_id_raw == "9000000779908504"
    assert o.amount_raw == "3904"
    assert o.title == "青岛博威斯机械有限公司"
    assert o.tax_id == "91370202MA7L5FEF9U"


def test_parse_xlsx_empty_input(base_config):
    p = TableParser(base_config)
    assert p.parse_xlsx(None).success is False
    assert p.parse_xlsx(b"").success is False


def test_parse_xlsx_corrupt_input(base_config):
    p = TableParser(base_config)
    assert p.parse_xlsx(b"not a real zip").success is False
